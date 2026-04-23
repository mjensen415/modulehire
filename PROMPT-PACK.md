# ModuleHire Labs — Prompt Pack
**For use in:** Claude Code · Google Antigravity  
**Last updated:** 2026-04-21  
**Repo:** `codex/projects/15_ModuleHire_Labs/modulehire-labs`  
**Product plan:** `codex/09_Resumes/PRODUCT-PLAN.md`

---

## Quick Context (paste at the top of any new session)

```
You are working on ModuleHire Labs — a Next.js 14 App Router app that parses
resumes into skill-domain modules and assembles tailored resumes from them.

Stack: Next.js 14 · Supabase (PostgreSQL + Storage + Auth) · Claude API ·
       Vercel · Tailwind CSS · shadcn/ui · docx npm · @react-pdf/renderer

Repo root: modulehire-labs/
Key files:
  src/app/api/parse-resume/route.ts     — Task 1: resume → modules
  src/app/api/analyze-jd/route.ts       — Task 2: JD text → extracted themes
  src/app/api/match-modules/route.ts    — Task 3: modules × JD → ranked stack
  src/app/api/generate-resume/route.tsx — Task 4: modules + JD → .docx + .pdf
  src/lib/supabase/{client,server,middleware}.ts
  supabase/schema.sql                   — Current DB schema
  supabase/migrations/                  — Versioned migration files

DB tables: users, resumes, modules, job_descriptions, generated_resumes
Storage buckets: resumes (Pro source files), generated (Pro outputs), temp (free outputs, 24h TTL)

All 4 API routes exist but need:
  1. AI provider abstraction (Claude vs Ollama VPS switchable via env var)
  2. Schema patch applied (soft delete, temp file columns, purge function)
  3. generate-resume updated to use temp bucket instead of bytea blobs
  4. Test scripts written

Do not touch any UI files unless explicitly asked.
```

---

## Prompt 1 — Apply Schema Patch

Run this in Antigravity or Claude Code from the repo root.

```
Create a new Supabase migration file at:
supabase/migrations/20260421_patch_001.sql

Paste the following SQL exactly:

-- 1. Soft delete columns
ALTER TABLE public.resumes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.modules ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.job_descriptions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.generated_resumes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. Remove bytea blob columns (replaced by temp bucket)
ALTER TABLE public.generated_resumes DROP COLUMN IF EXISTS docx_blob;
ALTER TABLE public.generated_resumes DROP COLUMN IF EXISTS pdf_blob;

-- 3. Add temp file tracking
ALTER TABLE public.generated_resumes ADD COLUMN IF NOT EXISTS is_temp BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.generated_resumes ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- 4. Indexes for soft delete and temp purge queries
CREATE INDEX IF NOT EXISTS idx_modules_deleted_at ON public.modules (deleted_at);
CREATE INDEX IF NOT EXISTS idx_resumes_deleted_at ON public.resumes (deleted_at);
CREATE INDEX IF NOT EXISTS idx_generated_resumes_expires_at
  ON public.generated_resumes (expires_at)
  WHERE is_temp = TRUE;

-- 5. updated_at auto-trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE PLPGSQL AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER modules_updated_at
  BEFORE UPDATE ON public.modules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. plan check constraint
ALTER TABLE public.users
  ADD CONSTRAINT IF NOT EXISTS users_plan_check CHECK (plan IN ('free', 'pro'));

-- 7. Purge function (called by Vercel Cron at 3am daily)
CREATE OR REPLACE FUNCTION public.purge_expired_temp_files()
RETURNS TABLE(docx_path TEXT, pdf_path TEXT) LANGUAGE PLPGSQL SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
    UPDATE public.generated_resumes
    SET deleted_at = NOW()
    WHERE is_temp = TRUE
      AND expires_at < NOW()
      AND deleted_at IS NULL
    RETURNING docx_url, pdf_url;
END;
$$;

-- 8. temp bucket storage policy (run after creating the bucket in Supabase dashboard)
CREATE POLICY "temp_user_folder" ON storage.objects
  FOR ALL USING (
    bucket_id = 'temp' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

Then run: supabase db push
(or apply via Supabase dashboard SQL editor if CLI not configured)
```

---

## Prompt 2 — AI Provider Abstraction Layer

```
Create src/lib/ai.ts with this exact interface:

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

type Message = { role: 'user' | 'assistant' | 'system'; content: string }

/**
 * Unified AI completion function.
 * Reads AI_PROVIDER env var: 'claude' (default) | 'ollama'
 * For ollama: uses openai package pointed at OLLAMA_BASE_URL with model OLLAMA_MODEL
 */
export async function aiComplete(messages: Message[], maxTokens = 2048): Promise<string> {
  const provider = process.env.AI_PROVIDER ?? 'claude'

  if (provider === 'ollama') {
    const client = new OpenAI({
      baseURL: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1',
      apiKey: 'ollama', // required by OpenAI SDK but unused by Ollama
    })
    const model = process.env.OLLAMA_MODEL ?? 'llama3.1'
    const res = await client.chat.completions.create({
      model,
      messages,
      max_tokens: maxTokens,
    })
    return res.choices[0].message.content ?? ''
  }

  // Default: Claude API
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const res = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    messages: messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    ...(messages.find(m => m.role === 'system')
      ? { system: messages.find(m => m.role === 'system')!.content }
      : {}),
  })
  return (res.content[0] as { text: string }).text
}

Then run: npm install openai

Then update all 4 API routes to use aiComplete() instead of calling Anthropic directly:
- Remove the per-file `const anthropic = new Anthropic(...)` instantiation
- Replace `anthropic.messages.create({...})` with `await aiComplete(messages, maxTokens)`
- The prompt strings stay the same — just wrap them in { role: 'user', content: prompt }

Also update the model name in any remaining Anthropic calls from
'claude-3-5-sonnet-20241022' to 'claude-sonnet-4-6'.
```

---

## Prompt 3 — Fix generate-resume Storage (temp bucket)

```
Update src/app/api/generate-resume/route.tsx:

Replace the blob storage section (the isPro check and blob/url logic) with:

  const resumeId = crypto.randomUUID()

  // Upload both files to temp bucket regardless of plan for now
  // Pro differentiation (permanent storage) comes in Phase 2
  const docxPath = `${user.id}/${resumeId}.docx`
  const pdfPath  = `${user.id}/${resumeId}.pdf`

  const { error: docxUploadErr } = await supabase.storage
    .from('temp')
    .upload(docxPath, docxBuffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
  if (docxUploadErr) throw docxUploadErr

  const { error: pdfUploadErr } = await supabase.storage
    .from('temp')
    .upload(pdfPath, pdfBuffer, { contentType: 'application/pdf' })
  if (pdfUploadErr) throw pdfUploadErr

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  const { data: savedResume, error: saveError } = await supabase
    .from('generated_resumes')
    .insert({
      id: resumeId,
      user_id: user.id,
      job_description_id: jd_id,
      title: resumeData.title,
      module_ids_used: module_ids,
      positioning_variant: positioning_variant,
      docx_url: docxPath,
      pdf_url: pdfPath,
      is_temp: true,
      expires_at: expiresAt,
    })
    .select()
    .single()
  if (saveError) throw saveError

  // Return signed URLs (valid 1 hour) so the client can download immediately
  const { data: docxSigned } = await supabase.storage
    .from('temp')
    .createSignedUrl(docxPath, 3600)
  const { data: pdfSigned } = await supabase.storage
    .from('temp')
    .createSignedUrl(pdfPath, 3600)

  return NextResponse.json({
    resume_id: savedResume.id,
    docx_url: docxSigned?.signedUrl,
    pdf_url:  pdfSigned?.signedUrl,
  })

Also remove the import of 'dbUser' and the isPro variable — they are no longer needed.
```

---

## Prompt 4 — Test Infrastructure

```
Create the following structure:

scripts/
  test-parse.ts
  test-generate.ts
test-fixtures/
  sample-resume.txt    (realistic 2-page community/tech resume, placeholder data)
  sample-jd.txt        (realistic VP of Community JD, placeholder data)
test-output/
  .gitkeep

Add to .gitignore:
  test-output/*.docx
  test-output/*.pdf

Install tsx if not present: npm install -D tsx

--- scripts/test-parse.ts ---
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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Script body:
// 1. Get or create a test user (email: test@modulehire.dev)
// 2. Insert a resume row, get resume_id
// 3. POST to /api/parse-resume with { raw_text, resume_id }
//    — use fetch with Authorization: Bearer <service_role_key> header
//    — print module count and first 2 modules
// 4. Insert a job_description row, get jd_id
// 5. POST to /api/analyze-jd with { raw_text, jd_id }
//    — print extracted themes and phrases
// 6. POST to /api/match-modules with { jd_id }
//    — print top 5 ranked modules
// Print total elapsed time.

--- scripts/test-generate.ts ---
/**
 * Full end-to-end test: parse → analyze → match → generate
 * Downloads .docx and .pdf to test-output/
 *
 * Usage: npx tsx scripts/test-generate.ts
 */
// Same auth pattern as test-parse.ts
// After match-modules, take recommended_stack module IDs
// POST to /api/generate-resume with { module_ids, jd_id, positioning_variant: 'A', user_name: 'Test User' }
// Download docx_url and pdf_url to test-output/test-result.docx and test-result.pdf
// Print: "✓ Generated in Xs — test-output/test-result.docx (Xkb) · test-result.pdf (Xkb)"

Note: the test scripts call the live API routes (not the AI provider directly),
so they test the full stack including Supabase read/write. Run with dev server active.
```

---

## Prompt 5 — Vercel Cron Route

```
Create app/api/cron/purge/route.ts:

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: expired, error } = await supabase.rpc('purge_expired_temp_files')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const paths: string[] = []
  for (const row of expired ?? []) {
    if (row.docx_path) paths.push(row.docx_path)
    if (row.pdf_path) paths.push(row.pdf_path)
  }

  if (paths.length > 0) {
    await supabase.storage.from('temp').remove(paths)
  }

  return NextResponse.json({ purged: paths.length })
}

Add to vercel.json (create if it doesn't exist):
{
  "crons": [{ "path": "/api/cron/purge", "schedule": "0 3 * * *" }]
}

Add to .env.local:
CRON_SECRET=your-random-secret-here
```

---

## .env.local Reference

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# AI Provider — switch between 'claude' and 'ollama'
AI_PROVIDER=ollama
ANTHROPIC_API_KEY=sk-ant-...        # used when AI_PROVIDER=claude

# Ollama VPS (used when AI_PROVIDER=ollama)
OLLAMA_BASE_URL=http://YOUR_VPS_IP:11434/v1
OLLAMA_MODEL=llama3.1

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Cron (Vercel)
CRON_SECRET=generate-a-random-string
```

---

## Build Order (Phase 1 checklist)

```
[ ] Apply schema patch (Prompt 1)
[ ] Create AI abstraction layer (Prompt 2)
[ ] Fix generate-resume storage (Prompt 3)
[ ] Add test infrastructure (Prompt 4)
[ ] Add cron route (Prompt 5)
[ ] Set AI_PROVIDER=ollama in .env.local, point OLLAMA_BASE_URL at VPS
[ ] Run: npx tsx scripts/test-parse.ts   (verify Tasks 1-3)
[ ] Run: npx tsx scripts/test-generate.ts (verify Task 4 + file output)
[ ] Confirm test-output/*.docx and *.pdf open correctly
[ ] Switch AI_PROVIDER=claude, re-run both scripts to verify Claude path
[ ] Deploy to Vercel, confirm cron appears in Vercel dashboard
```
