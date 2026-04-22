/**
 * Full end-to-end test: parse → analyze → match → generate
 * Downloads .docx and .pdf to test-output/
 *
 * Usage: npx tsx scripts/test-generate.ts
 * Requires: Next.js dev server running on localhost:3000
 */
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import * as dotenv from 'dotenv'
import axios from 'axios'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  const startTime = Date.now()

  console.log('--- Starting End-to-End Test ---');

  // 1. Get or create test user
  let userId: string | undefined;
  try {
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: 'test@modulehire.dev',
      password: 'password123',
      email_confirm: true
    })
    if (authUser?.user?.id) {
      userId = authUser.user.id;
    } else if (authError) {
      throw authError;
    }
  } catch (err: any) {
    const isEmailExists = err?.code === 'email_exists' || (err?.message ?? '').toLowerCase().includes('already');
    if (isEmailExists) {
      const { data: users } = await supabase.auth.admin.listUsers()
      const existing = users?.users.find((u: any) => u.email === 'test@modulehire.dev')
      userId = existing?.id;
    } else {
      console.error("Could not get or create test user", err);
      return;
    }
  }

  if (!userId) {
    console.error("Could not resolve test user ID");
    return;
  }
  console.log(`✓ Test user ready (ID: ${userId})`);

  // Sign in to get a real JWT for API calls
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: 'test@modulehire.dev',
    password: 'password123'
  })
  const accessToken = signInData.session?.access_token
  if (!accessToken) {
    console.error("Could not sign in as test user", signInError);
    return;
  }
  console.log(`✓ Signed in (token: ${accessToken.slice(0, 20)}...)`);

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`
  }

  // Ollama can be slow — use axios with a 10-minute timeout to avoid undici headersTimeout
  const slowFetch = async (url: string, init: RequestInit & { body?: string }) => {
    const res = await axios({
      method: (init.method ?? 'GET') as any,
      url,
      headers: init.headers as any,
      data: init.body,
      timeout: 600_000,
      validateStatus: () => true,  // don't throw on non-2xx
    })
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      text: async () => typeof res.data === 'string' ? res.data : JSON.stringify(res.data),
      json: async () => res.data,
    }
  }

  // 2. Insert resume row
  const rawResumeText = fs.readFileSync(path.join(__dirname, '../test-fixtures/sample-resume.txt'), 'utf8')
  const { data: resumeRow, error: resumeError } = await supabase
    .from('resumes')
    .insert({ user_id: userId, filename: 'sample-resume.txt', raw_text: rawResumeText })
    .select()
    .single()
  if (resumeError) { console.error("Error inserting resume", resumeError); return; }
  const resumeId = resumeRow.id;
  console.log(`✓ Inserted resume (ID: ${resumeId})`);

  // 3. Parse resume
  console.log("\nParsing resume (slow)...");
  const parseRes = await slowFetch('http://localhost:3000/api/parse-resume', {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ raw_text: rawResumeText, resume_id: resumeId })
  })
  if (!parseRes.ok) { console.error("Failed to parse resume:", await parseRes.text()); return; }
  const parseData = await parseRes.json()
  console.log(`✓ Parsed ${parseData.modules?.length ?? 0} modules`);

  // 4. Insert JD row
  const rawJdText = fs.readFileSync(path.join(__dirname, '../test-fixtures/sample-jd.txt'), 'utf8')
  const { data: jdRow, error: jdError } = await supabase
    .from('job_descriptions')
    .insert({ user_id: userId, raw_text: rawJdText, source_type: 'paste' })
    .select()
    .single()
  if (jdError) { console.error("Error inserting JD", jdError); return; }
  const jdId = jdRow.id;
  console.log(`✓ Inserted JD (ID: ${jdId})`);

  // 5. Analyze JD
  console.log("\nAnalyzing JD (slow)...");
  const analyzeRes = await slowFetch('http://localhost:3000/api/analyze-jd', {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ raw_text: rawJdText, jd_id: jdId })
  })
  if (!analyzeRes.ok) { console.error("Failed to analyze JD:", await analyzeRes.text()); return; }
  console.log("✓ JD analyzed");

  // 6. Match modules
  console.log("\nMatching modules (slow)...");
  const matchRes = await slowFetch('http://localhost:3000/api/match-modules', {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ jd_id: jdId })
  })
  if (!matchRes.ok) { console.error("Failed to match modules:", await matchRes.text()); return; }
  const matchData = await matchRes.json()

  // match-modules returns { ranked_modules, recommended_stack }
  const module_ids: string[] = matchData.recommended_stack ?? []
  if (module_ids.length === 0) {
    console.warn("No modules in recommended_stack. Cannot proceed.");
    console.log("Full match response:", JSON.stringify(matchData, null, 2));
    return;
  }
  console.log(`✓ Matched — ${module_ids.length} modules in recommended stack`);

  // 7. Generate resume
  console.log("\nGenerating resume (slow)...");
  const generateRes = await slowFetch('http://localhost:3000/api/generate-resume', {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({
      module_ids,
      jd_id: jdId,
      positioning_variant: 'A',
      user_name: 'Test User'
    })
  })
  if (!generateRes.ok) { console.error("Failed to generate resume:", await generateRes.text()); return; }
  const generateData = await generateRes.json()

  const { docx_url, pdf_url } = generateData;

  // 8. Download files to test-output/
  const outputDir = path.join(__dirname, '../test-output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const docxPath = path.join(outputDir, 'test-result.docx');
  const pdfPath  = path.join(outputDir, 'test-result.pdf');

  if (docx_url) {
    const buf = await (await fetch(docx_url)).arrayBuffer();
    fs.writeFileSync(docxPath, Buffer.from(buf));
  } else {
    console.warn("No DOCX URL returned.");
  }

  if (pdf_url) {
    const buf = await (await fetch(pdf_url)).arrayBuffer();
    fs.writeFileSync(pdfPath, Buffer.from(buf));
  } else {
    console.warn("No PDF URL returned.");
  }

  const elapsed = (Date.now() - startTime) / 1000;
  const docxKb = fs.existsSync(docxPath) ? (fs.statSync(docxPath).size / 1024).toFixed(1) : '0';
  const pdfKb  = fs.existsSync(pdfPath)  ? (fs.statSync(pdfPath).size  / 1024).toFixed(1) : '0';

  console.log(`\n✓ Generated in ${elapsed.toFixed(2)}s — test-output/test-result.docx (${docxKb}kb) · test-result.pdf (${pdfKb}kb)`);
}

main().catch(console.error);
