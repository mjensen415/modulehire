/**
 * Tests Task 1 (parse-resume) and Task 2 (analyze-jd) in isolation.
 * Uses Supabase service role key to insert test data directly,
 * then calls the API routes as if authenticated.
 *
 * Usage: npx tsx scripts/test-parse.ts
 * Requires: Next.js dev server running on localhost:3000
 */
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import axios from 'axios'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load env vars if needed (tsx handles some, but we might need dotenv if not using Next.js env loading directly)
// Assuming NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are in the environment when running through Next/tsx with env loaded
import * as dotenv from 'dotenv'
dotenv.config({ path: path.join(__dirname, '../.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  const startTime = Date.now()
  
  console.log('--- Setting up Test Data ---');
  // 1. Get or create a test user (email: test@modulehire.dev)
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
    // User already exists — look them up by email
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

  // Sign in to get a real access token for API calls
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

  // 2. Insert a resume row, get resume_id
  const rawResumeText = fs.readFileSync(path.join(__dirname, '../test-fixtures/sample-resume.txt'), 'utf8')
  
  const { data: resumeRow, error: resumeError } = await supabase
    .from('resumes')
    .insert({ user_id: userId, filename: 'sample-resume.txt', raw_text: rawResumeText })
    .select()
    .single()
    
  if (resumeError) {
    console.error("Error inserting resume", resumeError);
    return;
  }
  
  const resumeId = resumeRow.id;
  console.log(`✓ Inserted resume (ID: ${resumeId})`);

  // Ollama can be slow — use axios with a 10-minute timeout to avoid undici headersTimeout
  const slowFetch = async (url: string, init: RequestInit & { body?: string }) => {
    const res = await axios({
      method: (init.method ?? 'GET') as any,
      url,
      headers: init.headers as any,
      data: init.body,
      timeout: 600_000,
      validateStatus: () => true,
    })
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      text: async () => typeof res.data === 'string' ? res.data : JSON.stringify(res.data),
      json: async () => res.data,
    }
  }

  // 3. POST to /api/parse-resume with { raw_text, resume_id }
  console.log("\n--- Task 1: Parse Resume ---");
  const parseRes = await slowFetch('http://localhost:3000/api/parse-resume', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      raw_text: rawResumeText,
      resume_id: resumeId
    })
  })
  
  if (!parseRes.ok) {
    console.error("Failed to parse resume:", await parseRes.text());
    return;
  }
  
  const parseData = await parseRes.json()
  const modulesCount = parseData.modules?.length || 0;
  console.log(`✓ Parsed ${modulesCount} modules.`);
  if (modulesCount > 0) {
    console.log("First 2 modules:");
    console.log(JSON.stringify(parseData.modules.slice(0, 2), null, 2));
  }

  // 4. Insert a job_description row, get jd_id
  const rawJdText = fs.readFileSync(path.join(__dirname, '../test-fixtures/sample-jd.txt'), 'utf8')
  
  const { data: jdRow, error: jdError } = await supabase
    .from('job_descriptions')
    .insert({ user_id: userId, raw_text: rawJdText, source_type: 'paste' })
    .select()
    .single()
    
  if (jdError) {
    console.error("Error inserting job description", jdError);
    return;
  }
  
  const jdId = jdRow.id;
  console.log(`\n--- Setting up JD Data ---`);
  console.log(`✓ Inserted job description (ID: ${jdId})`);

  // 5. POST to /api/analyze-jd with { raw_text, jd_id }
  console.log("\n--- Task 2: Analyze JD ---");
  const analyzeRes = await slowFetch('http://localhost:3000/api/analyze-jd', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      raw_text: rawJdText,
      jd_id: jdId
    })
  })
  
  if (!analyzeRes.ok) {
    console.error("Failed to analyze JD:", await analyzeRes.text());
    return;
  }
  
  const analyzeData = await analyzeRes.json()
  console.log("✓ JD Themes extracted:");
  console.log(JSON.stringify(analyzeData.analysis?.themes, null, 2));
  console.log("\n✓ JD Phrases extracted:");
  console.log(JSON.stringify(analyzeData.analysis?.phrases, null, 2));

  // 6. POST to /api/match-modules with { jd_id }
  console.log("\n--- Match Modules ---");
  const matchRes = await slowFetch('http://localhost:3000/api/match-modules', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({ jd_id: jdId })
  })
  
  if (!matchRes.ok) {
    console.error("Failed to match modules:", await matchRes.text());
    return;
  }
  
  const matchData = await matchRes.json()
  const topModules = matchData.recommendations?.slice(0, 5) || [];
  console.log(`✓ Top ${topModules.length} ranked modules:`);
  topModules.forEach((mod: any, index: number) => {
    console.log(`${index + 1}. Module ID: ${mod.module_id} (Score: ${mod.match_score})`);
    console.log(`   Justification: ${mod.justification}`);
  });

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\n✓ Total elapsed time: ${elapsed.toFixed(2)}s`);
}

main().catch(console.error);
