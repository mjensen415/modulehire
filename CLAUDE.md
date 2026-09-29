@AGENTS.md

# ModuleHire — Project Context for Claude

## What this app is
ModuleHire is a resume generation tool built on a "modular resume" concept. Users upload a resume, it gets parsed into reusable skill/experience modules, and they can generate tailored resumes for specific job descriptions by selecting the right modules. Currently in private beta (code-gated signup). ModuleHire is the first product under **ModuleHire Labs**, a parent company focused on using AI to help people present themselves better.

## Stack
- Next.js 16 App Router (Turbopack), TypeScript
- Supabase (Postgres + Auth + Storage + RLS)
- Vercel deployment
- Stripe for billing
- AI via `src/lib/ai.ts` (`aiComplete` / `aiCompleteJson`, tiered — see "AI model tiering" below)

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

### Priority 5 — Module library depth
11. **Module grouping in generate step** — When multiple modules share the same skill domain or overlap in topic (e.g. three "Data Analysis" modules from different jobs), group them visually in the building step with a "pick one or include both" affordance. Hold until enough users have deep libraries to validate whether this is actually needed in practice.

---

## Known DB migrations (applied to Supabase, NOT yet in schema.sql — add before any fresh deploys)
- `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone text, linkedin_url text, location text;`
- `ALTER TABLE public.generated_resumes ADD COLUMN IF NOT EXISTS ats_score integer;`
- `job_experiences` table with unique constraint `job_experiences_user_company_title_start_key` on (user_id, company, title, start_date)
- `module_job_assignments` table (module_id, job_id primary key)
- `job_skills` table (id, user_id, job_id, name)
- `skill_module_assignments` table (skill_id, module_id primary key)
- All four new tables have RLS enabled with `_own` policies
- `ALTER TABLE users ADD COLUMN IF NOT EXISTS resume_credits INTEGER NOT NULL DEFAULT 0;` (applied directly via Supabase MCP)
- `increment_resume_credits(p_user_id uuid, p_amount integer)` function created
- `education` table (id, user_id, school, degree, field, year, sort_order, updated_at, created_at) — pre-existed in production with data; migration backfilled in `supabase/migrations/20260820_education.sql`
- `user_profiles` table + `modules.profile_id` + `users.active_profile_id` + `generated_resumes.profile_id` — applied via MCP, tracked in `supabase/migrations/20260819_user_profiles.sql`
- `applicants.ai_check_result` (jsonb) + `applicants.ai_checked_at` — applied via MCP, tracked in `supabase/migrations/20260819_applicants_ai_flag.sql`
- `ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;` — applied via MCP, tracked in `supabase/migrations/20260820_user_preferences.sql`
- `prompt_feedback` table (id, user_id, lab_type, input_snapshot, output_snapshot, feedback, notes, created_at) + admin-only RLS policy (`users.is_admin = true`) — applied via MCP, tracked in `supabase/migrations/20260826_prompt_feedback.sql`. Backs the admin-only Prompt Lab (`/admin/prompt-lab`) for testing/rating JD parse, module match, and module rewrite prompts.
- `ALTER TABLE public.modules ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;` — applied via MCP, tracked in `supabase/migrations/20260828_module_pinned.sql`, already reflected in `schema.sql`. Splits "always include in matches" (now `pinned`, user-set, capped at 2 per profile) out of `weight` (now a minor scoring nudge only — see `match-modules/route.ts`).
- `match_runs` table (id, user_id, jd_id, ranked_modules jsonb, recommended_stack text[], created_at) + own-rows RLS policy — applied via MCP, tracked in `supabase/migrations/20260915_match_runs.sql`. Logs every production Match call's output (not just admin Prompt Lab dry-runs) so match quality can be validated against real usage later; join with `generated_resumes` on `(user_id, jd_id)` for outcome analysis.
- `modules.dimensions text[]` + `job_descriptions.extracted_criteria/match_report/match_report_at/match_report_profile_id jsonb` — applied via MCP, tracked in `supabase/migrations/20260929_dimensions.sql`. Six-dimension tagging (`src/lib/dimensions.ts`: role/seniority/responsibility/skill/domain/collaboration) shared by modules and typed, weighted JD criteria — data foundation for the JD Match Report feature (score per criterion with evidence).
- `ALTER TABLE public.usage_events ADD COLUMN IF NOT EXISTS metadata jsonb;` — applied via MCP, tracked in `supabase/migrations/20260929_usage_events_metadata.sql`. AI call sites that pass `{ userId, action }` to `aiComplete`/`aiCompleteJson` fire-and-forget log `{ model, input_tokens, output_tokens }` here for cost-per-action visibility.
- `ALTER TABLE public.job_descriptions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();` — applied via MCP, tracked in `supabase/migrations/20260929_jd_updated_at.sql`. Bumped by `PATCH /api/job-descriptions/[id]` on every edit; used by `/api/match-report`'s cache-freshness check alongside `modules.updated_at`.
- Widened `usage_events_action_check` to also allow `analyze_jd`, `parse_modules`, `match_job_pass2`, `match_report` (previously only `generate_resume`/`match_job`/`upload_resume`/`rl_*` — every new tiered AI call site's cost-logging insert was silently failing the CHECK constraint until this). Applied via MCP, tracked in `supabase/migrations/20260929_usage_events_action_check.sql`. If a new call site starts passing `{ userId, action }` to `aiComplete`/`aiCompleteJson`, its action string must be added here too or the insert will fail (check `usage_events` for `metadata is not null` to confirm logging is actually landing).

## AI model tiering (`src/lib/ai.ts`)
Every AI call site picks a tier explicitly — `ANTHROPIC_MODEL` is NOT flipped globally.
`resolveModel(tier)` resolves `'fast'` → `ANTHROPIC_MODEL_FAST` (Haiku) and `'quality'` →
`ANTHROPIC_MODEL_QUALITY` (Sonnet 5); `aiComplete`/`aiCompleteJson` take `{ tier }` (default
`'fast'` via the untiered `'default'` resolution) and an optional `model` override (used by the
Prompt Lab's model selector). `aiCompleteJson<T>(messages, schema, maxTokens, opts)` uses forced
Anthropic tool-use for structured output — used by `/api/match-report`, `analyze-jd` (+ prompt-lab
mirror), `match-modules` pass 1 and pass 2 (+ prompt-lab mirror), `parse-modules` (module
extraction), and `score-applicant`. A schema's root must be `type: 'object'` — `parse-modules`
wraps its module array as `{ modules: [...] }` since Anthropic tool-use requires an object at the
top level. `match-modules` also injects a `match_report`'s per-criterion scores into its prompt
context when one exists for the active profile (`reportContext` in `match-modules/route.ts`), so
module ranking agrees with the report instead of re-deriving an independent judgment.

| Tier | Call sites |
|---|---|
| `fast` | contact extraction + skill extraction (`parse-modules.ts`), `detect-duplicate-experiences`, `admin/backfill-dimensions`, `match-modules` pass 1 (+ prompt-lab mirror) |
| `quality` | module extraction (`parse-modules.ts`), `analyze-jd` (+ prompt-lab mirror), `match-modules` pass 2 (+ prompt-lab mirror), `match-report`, `suggest-module-rewrite` (+ prompt-lab mirror), `interview-prep`, `score-applicant`, `business/applicants/[id]/ai-check`, `business/job-postings`, `generate-resume` (all 3 calls), `suggest-summary`, `theme-alignment` |

`maxDuration` raised to 300 for `parse-resume`, `reparse-my-modules`, `admin/reparse-user`,
`business/applicants/upload`, `business/applicants/[id]/rescore`, `business/applicants/[id]/ai-check`;
120 for `analyze-jd`, `match-modules` (+ prompt-lab mirror), `match-report`, `interview-prep`,
`admin/prompt-lab/jd-parse`.

`checkOrgDailyScoreCap()` in `src/lib/rate-limit.ts` caps AI-scored applicants at 500/day per org
(`organizations.tier != 'enterprise'` only), checked before `scoreApplicant()` in the CSV and
single-upload business routes — bulk scoring now runs on the `quality` tier, several times the
cost of Haiku.

## Dashboard layout
Two columns via `.dash-two-col-b` (defined in `globals.css`, ~38%/62% split above 900px, stacks
to one column at/below it — the same breakpoint `.dash-two-col` uses). Left: resume/profile card
(`DashboardProfileSwitch.tsx` for the profile picker), "What you're targeting" (from
`users.preferences.target_roles[0]`/`career_level` and `users.location`), and the per-dimension
module breakdown (count + 5-dot strength, `anchor`/`strong` modules weighted 1.5×) — each row
links to `/library?dimension=<name>`, which the library page reads into `dimensionFilter` state
alongside its existing weight/assignment filter chips. Right: the existing `nextMove` card
(restyled), a compact `MatchReport` for the most recent JD with `extracted_criteria`, and recent
resumes. Job descriptions and a module-library link render full-width below both columns.

## JD Match Report
`POST /api/match-report` (`{ jd_id }`) scores each of a JD's `extracted_criteria` against the
active profile's modules in one `aiCompleteJson` call (only modules tagged with the criterion's
dimension, or untagged, are shown per criterion to keep the prompt small), computes a weighted
overall score, and caches the result on `job_descriptions.match_report`/`match_report_at`/
`match_report_profile_id` — reused until the JD or a module is edited afterward. Rendered by
`src/components/MatchReport.tsx` (`full` variant on `/generate` after JD confirmation and on
`/matches/[jd_id]`; `compact` variant on the `/matches` list, sorted by score, and as the tracker
score badge in `src/app/(app)/job-tracker/page.tsx`). `match-modules` does not yet read the
report's per-criterion scores into its own ranking — a follow-up, not done in this pass.

## Gotchas
- `git add` with parentheses in paths trips up zsh — always use `git add -A`
- Sandbox leaves `.git/index.lock` files; delete from local machine before committing
- `onConflict` upserts require a real unique constraint in the DB — nullable columns in unique constraints need special handling (use DO $$ block to add constraints safely)
- `parse-modules.ts` uses admin client for job_experiences inserts (user client blocked by RLS)
- `/api/job-experiences` orders by `start_date DESC` — no `sort_order` column exists
- `CREATE TABLE IF NOT EXISTS` skips the entire statement if the table exists — add constraints separately, not inline
