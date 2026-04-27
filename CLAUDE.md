@AGENTS.md

# ModuleHire — Project Context for Claude

## What this app is
ModuleHire is a resume generation tool built on a "modular resume" concept. Users upload a resume, it gets parsed into reusable skill/experience modules, and they can generate tailored resumes for specific job descriptions by selecting the right modules. Currently in private beta (code-gated signup). ModuleHire is the first product under **ModuleHire Labs**, a parent company focused on using AI to help people present themselves better.

## Stack
- Next.js 16 App Router (Turbopack), TypeScript
- Supabase (Postgres + Auth + Storage + RLS)
- Vercel deployment
- Stripe for billing
- AI via `src/lib/ai.ts` (aiComplete helper)

## Key data model
- `users` — profile: name, email, phone, linkedin_url, location, plan
- `resumes` — uploaded source resumes (raw_text stored)
- `modules` — parsed skill/experience blocks (title, content, weight, themes, source_company, source_role_title, date_start, date_end)
- `job_experiences` — work history entries linked to a user (company, title, start_date, end_date)
- `module_job_assignments` — many-to-many: modules ↔ job_experiences
- `job_skills` — free-text skills tied to a job_experience
- `skill_module_assignments` — many-to-many: job_skills ↔ modules
- `job_descriptions` — target JDs users paste/import
- `generated_resumes` — output resumes (docx/pdf), with ats_score
- `beta_codes` — single-use invite codes (is_active, used_at, used_by_email)
- `beta_requests` — waitlist signups (email, context, marketing_opt_in)

## Auth flow
- Public: `/request-access` (waitlist), `/signin` (sign in + code-gated signup)
- Beta code validated on typing (debounced, `/api/validate-beta-code`), unlocks signup form
- Signup via `/api/auth/signup` — uses admin.createUser({ email_confirm: true })
- Light/dark mode toggle (ThemeToggle component, localStorage `mh-theme`)

## Resume upload flow
1. `/upload` → POST `/api/upload-resume` → extracts raw_text
2. POST `/api/parse-resume` → calls `parseModules()` in `src/lib/parse-modules.ts`
3. `parseModules` inserts modules, then uses **admin client** to upsert job_experiences + module_job_assignments (user client blocked by RLS)
4. Contact info extracted → upserts to `users` table — **always overwrites** from resume (first upload is silent; subsequent uploads should prompt with "Don't ask again" option — not yet built)
5. Redirects to `/module-review` → user reviews/edits → saves to library

## Library page (`/library`)
- Left sidebar: list of job_experiences, click to select
- Right panel (when job selected): two columns — modules assigned to that job | skills for that job
- Bottom: searchable module repository with filter chips
- All data loaded from: /api/job-experiences, /api/my-modules, /api/module-job-assignments, /api/job-skills, /api/skill-module-assignments
- Backfill button (sync jobs from modules) — planned, not built yet

---

## Backlog (do NOT start without being asked)

### Just shipped
- [x] Library page redesign (job sidebar + modules panel + skills + repository)
- [x] job_experiences + module_job_assignments auto-created on resume parse (admin client)
- [x] My Info always overwrites from resume contact extraction
- [x] Beta access system (waitlist page, code-gated signup, marketing opt-in)
- [x] Light/dark mode toggle
- [x] Score column on Applications page + ScoreGauge component

### Priority 1 — Core bugs / immediate polish
1. **Library UX polish** — Editing UX for job experiences, modules, and skills is rough. Need inline editing, add/remove flows, and better empty states. Data loads correctly now; interaction layer needs work.
2. **Surface parse errors** — `parseModules` swallows job_experience upsert errors. Add `jobSyncError` to return type, surface in API response. Prompt for Code already written.
3. **Backfill button** — "Sync jobs from modules" in Library sidebar → POST `/api/backfill-job-experiences`. Prompt for Code already written.
4. **Profile sync UX** — First upload: auto-populate silently (done). Subsequent uploads: show modal "Update your profile from this resume?" with "Don't ask again" checkbox stored in `localStorage['mh-profile-sync-skip']`. Prompt for Code already written.

### Priority 2 — ATS score & resume quality
5. **ATS score improvement** — Current test returned 46/100. The whole point of the app is to get through ATS. Changes needed:
   - Resume builder should aggressively incorporate "Consider adding" keywords and all matched skills from the JD
   - Show an **estimated ATS score** before generating ("We estimate this resume will score ~X")
   - Add a disclaimer: "All ATS systems are different — scores are estimates and may vary based on each company's settings"
   - Target score: >90. Tune the generation prompt to maximize keyword density and relevance
6. **JD keyword confirmation page** — After a user uploads/pastes a job description, show them a "Keywords & skills identified" page where they can confirm/edit before generating. Use confirmed keywords to drive module selection.

### Priority 3 — Branding & marketing
7. **Logo** — Nav currently uses the uploaded file path. Need proper options: SVG wordmark, icon mark, or combo mark. Design should feel like a modern dev/AI tool. Start with SVG inline options.
8. **Social media branding** — Once logo is finalized, create social assets (profile images, cover photos, etc.) for LinkedIn, Twitter/X, and any other relevant platforms.
9. **ModuleHire Labs homepage** — Parent company landing page at the root or a dedicated domain. ModuleHire is product #1. Standard landing page: hero, company vision ("AI to help people present themselves better"), product showcase, CTA. Not the same as the ModuleHire product page.

### Priority 4 — Generation & output quality
10. **Better generated resume format** — Investigate using `.design.md` files or a more structured template system for resume generation. Current output quality needs review.

---

## Known DB migrations (applied to Supabase, NOT yet in schema.sql — add before any fresh deploys)
- `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone text, linkedin_url text, location text;`
- `ALTER TABLE public.generated_resumes ADD COLUMN IF NOT EXISTS ats_score integer;`
- `job_experiences` table with unique constraint `job_experiences_user_company_title_start_key` on (user_id, company, title, start_date)
- `module_job_assignments` table (module_id, job_id primary key)
- `job_skills` table (id, user_id, job_id, name)
- `skill_module_assignments` table (skill_id, module_id primary key)
- All four new tables have RLS enabled with `_own` policies

## Gotchas
- `git add` with parentheses in paths trips up zsh — always use `git add -A`
- Sandbox leaves `.git/index.lock` files; delete from local machine before committing
- `onConflict` upserts require a real unique constraint in the DB — nullable columns in unique constraints need special handling (use DO $$ block to add constraints safely)
- `parse-modules.ts` uses admin client for job_experiences inserts (user client blocked by RLS)
- `/api/job-experiences` orders by `start_date DESC` — no `sort_order` column exists
- `CREATE TABLE IF NOT EXISTS` skips the entire statement if the table exists — add constraints separately, not inline
