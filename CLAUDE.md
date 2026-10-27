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
- `job_descriptions.raw_text_hash text` + index on `(user_id, raw_text_hash)` — applied via MCP, tracked in `supabase/migrations/20261001_jd_raw_text_hash.sql`. sha256 of the trimmed pasted text; `/api/analyze-jd` streams back an existing row's result instead of re-calling the AI when a non-deleted row with the same hash and `extracted_criteria` already exists for that user.
- `draft_generations` table (user_id PK, step/jd_id/jd_text/selected_module_ids/confirmed_themes/confirmed_phrases/alignment_states/resume_format/job_level/pos_variant/include_summary/summary_override/include_cover_letter/cover_letter_tone/cover_letter_notes/include_skills/skills/include_education/education/include_awards/awards_text/updated_at) + own-rows RLS policy — applied via MCP, tracked in `supabase/migrations/20261001_draft_generations.sql`. Backs `/api/draft-generation`'s autosave in `/generate` (`src/app/(app)/generate/page.tsx`'s `draftPayload`); the table had never been migrated, so every autosave `PUT` had been 500ing in production (the `GET` path silently swallowed the same error via `data ?? null`, so it went unnoticed) until this fix.
- `job_descriptions.extracted_fluff text[]` + `job_descriptions.degree_requirement jsonb` + `job_postings.degree_requirement jsonb` — applied via MCP, tracked in `supabase/migrations/20261013_jd_signal.sql` (also in `schema.sql`). Filled by the analyze-jd basics pass (`src/lib/jd-signal.ts` holds the shared prompts/schemas/sanitizers); criteria also carry `mentions`/`also_called` inside the existing `extracted_criteria` jsonb. A waivable degree on a business posting never trips an applicant dealbreaker (`score-applicant.ts`).
- `job_applications.source/posting_age/first_response_at/response_type` + `no_response` added to `job_applications_status_check` — applied via MCP, tracked in `supabase/migrations/20261013_tracker_signal.sql`. Nudges and the "What's working for you" card are computed on read in `src/lib/tracker.ts`.
- Widened `usage_events_action_check` to also allow an `ev_` prefix (generate v2 product events) — applied, tracked in `supabase/migrations/20261024_usage_events_product_events.sql`.
- `library_repairs` (audit rows, admin-read RLS) + `apply_library_repair` / `undo_library_repair` functions (service role only) — tracked in `supabase/migrations/20261027_library_repairs.sql`. **Not yet applied** as of 2026-10-27; the library health page's Preview works without it, Apply/Undo report that it's missing.
- `resume_documents` (+ `fit_report jsonb`) and `resume_document_history`, both with own-rows RLS — applied via MCP, tracked in `supabase/migrations/20261023_resume_documents.sql`. If the `resume_documents` insert ever fails, `generate-resume` logs it and that resume falls back to the file-only view.
- `generated_resumes.generation_flags jsonb` + `generated_resumes.unsupported_phrases text[]` — applied via MCP, tracked in `supabase/migrations/20261022_generation_flags.sql` (also in `schema.sql`). Written by `generate-resume` after the server-side fact check (`src/lib/fact-check.ts`): bullets rewritten because they named a number or proper noun their source module doesn't contain (`{ module_id, bullet, reason, replacement }`), and posting phrases left off because no module supports them (shown on the done step and `/resumes/[id]` with an Add a module link).

## AI models and usage logging (`src/lib/ai.ts`)
**Haiku everywhere.** Every call resolves to `ANTHROPIC_MODEL_FAST` (Haiku) unless its `action` is
listed in the `SONNET_FEATURES` env var (comma-separated, or `all`), which opts that one feature into
`ANTHROPIC_MODEL_QUALITY` (Sonnet). `tier: 'quality'` only marks a call as *eligible* for Sonnet; on
its own it gets Haiku. `SONNET_FEATURES` is not set in Vercel. The Prompt Lab's model picker
(`model` option) overrides for admin testing. `aiComplete` / `aiCompleteJson` / `aiStream` also take
`temperature` (retries after a failed validation pass 0). `aiCompleteJson` uses forced tool use; a
schema's root must be `type: 'object'`.

Calls with `{ userId, action }` log to `usage_events.metadata`: `model`, `input_tokens`,
`output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, `duration_ms`. Action
prefixes allowed by `usage_events_action_check`: the original fixed names, `ai_*` (AI cost rows),
`rl_*` (rate-limit counters, `checkAndLog`), and `ev_*` (product events: `ev_draft_created`,
`ev_stage_basics|criteria|match|document`, `ev_export`, `ev_export_text`, `ev_library_add`,
`ev_rail_tab`, `ev_classic_open`). A new action outside those prefixes must be added to the check or
its insert silently fails.

Worked examples and retries (Haiku does narrow, checked jobs well): one short worked example each in
per-role module extraction, JD criteria (`CRITERIA_WORKED_EXAMPLE` in `jd-signal.ts`), match-report
scoring, and the resume bullet writer; one retry at temperature 0 when output fails validation
(criteria < 3, an unscored criterion, a role with text returning no modules, unparseable resume JSON).
`max_tokens` follow logged outputs (criteria 1600, match report 2400, resume 2400, pass 2 600;
per-role parse 3200 because Haiku overran 2048). Before/after numbers:
`docs/reports/haiku-first-2026-10-27.md`.

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
module breakdown (count + 5-dot strength, `anchor`/`strong` modules weighted 1.5×) — each row is a
`DashboardBreakdownRow.tsx` client component (dashboard itself stays a server component, passing
each dimension's first 5 module `{id, title}` as props) that expands on click to list those titles
(linking to `/library/[id]`), a "See all N in library →" link to `/library?dimension=<name>` when
there are more, and a weak-dimension hint (`strength <= 2`). The library page reads `?dimension=`
into `dimensionFilter` state alongside its existing weight/assignment filter chips. Right: the
existing `nextMove` card (restyled), a compact `MatchReport` for the most recent JD with
`extracted_criteria`, and recent resumes. Job descriptions and a module-library link render
full-width below both columns.

## Dimension chips on modules
Modules carry 1-3 dimensions (tagged at parse time or via the admin backfill — see "Six-dimension
tagging" migration). Shown as small outlined chips under the title on module cards in `/library`
(job-assigned column + repository grid), `/module-review`, and the module-building list in
`/generate`. Editable in the library's module edit modal as toggle chips (max 3) — saved through
`PATCH /api/modules/[id]`, which validates with `isDimension` and allows `dimensions` as an
updatable field alongside the existing ones. `match-modules`'s module `select()` includes
`dimensions` so the ranked list downstream has it to render.

## JD analysis (two-pass, streamed)
`POST /api/analyze-jd` returns NDJSON (`application/x-ndjson`), not a single JSON object — company/
title/role-type/seniority/themes/phrases run on the `fast` tier and `extracted_criteria` runs on
`quality`, started together, each written to the row and streamed as its own line
(`{"type":"basics",...}` then `{"type":"criteria",...}`, finishing with `{"type":"done"}`; a stage
that fails sends `{"type":"error","stage":"basics"|"criteria"}` and the other stage still completes
independently). Deduped by `raw_text_hash` — an identical paste from the same user replays the
cached row instead of re-calling the AI. `src/app/(app)/generate/page.tsx`'s `startAnalysis()`
kicks this off in the background 1.2s after the user stops typing a paste over 300 characters
(nothing shown yet), and `handleMatch`/`handleConfirm` reuse that same in-flight run keyed by the
exact pasted text — `handleConfirm` awaits the criteria promise's resolved value directly rather
than reading React state, since a state update from that promise's `.then` isn't visible on the
stale closure of an in-flight async function. The admin Prompt Lab's JD Parser tab
(`admin/prompt-lab/jd-parse/route.ts`) mirrors the same two parallel calls non-streaming.

## Resume parsing (outline + parallel per-role, streamed)
`parseModules()` in `src/lib/parse-modules.ts` runs a `fast`-tier outline pass first (one entry
per job/role + a `has_extras` flag for standalone skills/projects/awards worth their own modules),
then — if 2+ roles were found — fires one `quality`-tier extraction call per role **plus** one for
"everything that isn't a role" in parallel (capped at 6 concurrent via `mapLimit`), instead of one
giant whole-resume call. Each call shares the same cached prompt prefix (instructions + full resume
text, `cache: true`) with only a short uncached suffix naming which role to focus on, so the cache
pays for itself across the batch. 0–1 roles fall back to the original single whole-resume call.
A role is retried once on a thrown error **or** an empty result (seen in practice: forced tool-use
occasionally returns nothing for one role in a batch even with real content) before being reported
failed. `POST /api/parse-resume` streams progress as NDJSON (`outline` → `role_done`/`role_failed`
per role, extras uses the sentinel index `-1` → `contact` → `done` with the full modules/contact
payload so `module-review`'s sessionStorage handoff and the first-upload profile-sync modal keep
working unchanged); pass `?mode=json` for the old single-response shape (used internally by
`reparse-my-modules`/`admin/reparse-user`, which call `parseModules()` directly and don't touch the
route at all). `src/components/ResumeBuildProgress.tsx` (used by `/upload` and onboarding) renders
the live build: header text driven by real events (never a timer), a progress bar, a per-role
timeline with module-count chips, and a live per-dimension breakdown that fills in as roles finish.
Each role's call gets only its slice of the resume, from the `start_anchor` the outline returns to
the next role's anchor (full text if the anchor isn't found). Outline roles that produce no modules
(an "Earlier Career" line) still become job records; board and advisory roles are roles; placeholder
employers ("<UNKNOWN>", "N/A") are treated as no company. `parseModules(..., { dryRun: true })` parses
for real but writes nothing (the eval suite). Forced tool-use is reliable but not airtight on thin/sparse resumes — `insertModulesBatch` drops any
non-object array element defensively (a bare string spread into an insert becomes numeric-keyed
columns Postgres rejects) and `extractModulesWithFocus` coerces a non-array `modules` response to
`[]` rather than letting it crash downstream `.filter`/`.map` calls.

## JD Match Report
`POST /api/match-report` (`{ jd_id }`) scores each of a JD's `extracted_criteria` against the
active profile's modules in one `aiCompleteJson` call (`src/lib/criteria-score.ts`, shared with the
editor's server fit: each module is listed once as id | title | dimensions | first 200 chars, only
modules tagged with a criterion's dimension or untagged, at most 60 by local relevance; a candidate
far above the role's level scores lower on seniority), computes a weighted
overall score, and caches the result on `job_descriptions.match_report`/`match_report_at`/
`match_report_profile_id` — reused until the JD or a module is edited afterward. Rendered by
`src/components/MatchReport.tsx` (`full` variant on `/generate` after JD confirmation and on
`/matches/[jd_id]`; `compact` variant on the `/matches` list, sorted by score, and as the tracker
score badge in `src/app/(app)/job-tracker/page.tsx`). `match-modules` does not yet read the
report's per-criterion scores into its own ranking — a follow-up, not done in this pass.

**Match score vs ATS Estimator — not the same metric, won't always agree.** Match score (this
feature) is an AI judgment of whether your actual module content demonstrates the JD's specific
requirements. The ATS Estimator (`estimatedAtsScore` in `generate/page.tsx`, and the composite
formula in `generate-resume/route.tsx`: 60% keyword/theme coverage + 20% contact completeness +
10% module count + 10% has-a-summary) is pure document mechanics — it can score high on a resume
that is a weak substantive fit, because real ATS software genuinely just keyword/field-matches and
doesn't judge experience depth. Both scores now carry explanatory copy/tooltips saying so
(`MatchReport.tsx`'s subtitle and compact-variant `title` attr; the ATS card's caption + disclaimer
in `generate/page.tsx` and `resumes/[id]/page.tsx`), and both surfaces cross-link to the other score
when a resume's ATS score is 20+ points above its JD's match score ("ATS-friendly, but your library
shows gaps for this role — see Match Report ↗"), so the gap reads as useful signal, not a bug.

## Resume detail page (`/resumes/[id]`)
Server component — joins `generated_resumes` with `job_descriptions (id, extracted_job_title,
extracted_role_type, extracted_company, source_url, match_report)`, signs the stored docx/pdf paths
(`storage.from('temp').createSignedUrl(path, 3600)`), and renders an inline PDF preview (`<iframe>`),
download buttons, a "Modules used" chip list (from `module_ids_used`), and a link to the JD's match
report when one exists. Dashboard's Recent Resumes rows and `/resumes` list rows link here.

## Job title fallback — no `extracted_role_type` as a title stand-in
`extracted_job_title` (the literal title as written in the JD, or empty string if none stated —
the fast pass in `analyze-jd`/`admin/prompt-lab/jd-parse` is explicitly told never to guess one or
write "Other") is the only field used to label a JD by title. Every site that shows a JD/resume by
title falls back straight to `'Untitled role'` — `extracted_role_type` (the internal taxonomy value
used for routing/matching logic, e.g. `community-manager`) is never shown as a title substitute.
When `extracted_job_title` is empty, `/generate`'s `reviewThemes` step shows a required inline card
above the criteria list ("We couldn't find a job title in this posting") with an autofocused title
input (+ optional company input); the Confirm button stays disabled with "Add a job title to
continue" until 2+ characters are entered, and both are saved via the existing
`PATCH /api/job-descriptions/[id]` (now also accepts `extracted_company`) in the same call that
saves the confirmed themes/phrases/criteria. Fixed sites: dashboard (latest-match title, next-move
role, recent-JD list, recent-resumes label), `/matches`, `/matches/[jd_id]`, `/resumes/[id]`,
`/generate`'s match-report and preview-summary labels. Left alone: secondary-descriptor uses of
`extracted_role_type` next to an already-distinct title (e.g. `generate/page.tsx`'s "Analyzed
{company} · {role_type}" banners, `applications`'s small subtitle line under the resume's own
title) and admin-only tooling (`admin/pipeline`, `admin/prompt-lab`).

## Generate v2: paste → draft → edit (`/generate`)
`/generate` is three states, no wizard: paste a posting (text or link) → Building (~20s,
`GenerateV2.tsx`, stage list driven by real events) → `/resumes/[id]` open in the editor. The
old four-step wizard is `ClassicGenerate.tsx` at `/generate?classic=1` for one release (every URL
it writes keeps `classic=1`; legacy `&step=` links also land there) — remove it after.
`/generate?jd_id=` (Regenerate / Make another version) starts a v2 draft for that JD directly.
- `POST /api/jobs/start` (`{ raw_text } | { url } | { jd_id }`) streams NDJSON `basics` → `criteria`
  → `match` → `draft_summary`/`draft_job` → `document` → `done`. It calls the analyze-jd,
  fetch-jd-url and generate-resume handlers **in-process** (same request and auth cookies; see
  `src/lib/internal-call.ts`) and runs matching itself from `src/lib/match.ts`. Stages overlap: the
  analysis stream is read in the background, the local shortlist is built as soon as the basics line
  arrives, re-ranked if criteria land within 4.5s, and pass 2 is never restarted. generate-resume is
  called with `stream: true` and emits the summary and each job as written (`src/lib/stream-json.ts`),
  then `document` as soon as the editable doc is saved (before keyword analysis and the cover letter).
  The Building screen shows the resume filling in and opens the editor on `document`; after 120s it
  stops with "This is taking longer than it should." and a retry that reuses the analyzed JD.
  A known JD with a logged `match_runs` row reuses it. A posting with no title stops at
  `need_title`; the client asks inline, PATCHes the JD, and calls again with `{ jd_id }`. Each run
  logs `ev_stage_*` rows (`duration_ms`, `at_ms` from paste, `first_content_ms`, `used_criteria`).
- Matching (`src/lib/match.ts`, also behind `/api/match-modules` and the Prompt Lab matcher): pass 1
  is a local term-overlap shortlist (`src/lib/shortlist.ts`, milliseconds; the old AI pass 1 is behind
  `?ai_pass1=1`), pass 2 re-scores the top 20 with content, scores only, listing modules by short refs
  (`m1`…`m20`). With UUIDs the output overran `max_tokens` on every run and silently fell back to the
  local scores.
- Auto-pick (`src/lib/job-grouping.ts`): recommended stack (pinned, then score), ≤3 modules for
  the two most recent roles and ≤2 for older ones, empty recent roles backfilled with their best
  module ≥60; generate-resume's `bullets_per_role` caps bullets (4 recent / 2 older) after the
  fact check. `jobResolver` (module → job) is shared with generate-resume.
- The editor rail replaces the Match screen: **Fit** (checklist; click a requirement to highlight
  its lines, or see the library module that could cover it / "Not in your library"; the old ATS
  keyword check is the "key phrases on the page" line), **Changes** (suggestion operations with
  Accept / Keep original + "Not on your resume"), **Library** (modules per job: On resume / + Add).
  Header: title, fit number, **Design** (template, sections via `ResumeDoc.hidden_sections`, cover
  letter; saved to `preferences.resume_defaults` via `PATCH /api/preferences`) and **Export**
  (PDF, Word, copy text).
- Measurement in `usage_events` (`ev_` prefix — needs the 20261024 migration): `ev_draft_created`
  (`metadata.ms` = paste → draft, target < 25s), `ev_export` (type, `saves` = edits batches before
  export), `ev_export_text`, `ev_library_add` (`from: library|fit`), `ev_rail_tab`. E.g. share of
  drafts exported: `count(distinct metadata->>'resume_doc_id') filter (where action like 'ev_export%')`
  over `count(*) filter (where action = 'ev_draft_created')`.

## Live resume editor (`/resumes/[id]`)
A generated resume is a live document, not a file. `generate-resume` builds a `ResumeDoc`
(`src/lib/resume-doc.ts`: header, summary, experience entries, combination skill sections,
skills, education, awards, format; every line is a `Block` with a stable `id`, `module_id`
provenance and the `original` text generation produced) from the fact-checked model output,
renders the files from it, and saves it to `resume_documents`. The renderers live in
`src/lib/resume-render.tsx` (`renderResume()` + `docToRenderInput()`); every template renders
from a `ResumeDoc`, and `GET /api/resume-docs/[id]/download?type=pdf|docx` re-renders the saved
doc on demand, so downloads always match the editor. Resumes generated before this have no
document and keep the old file preview.

Editor: `src/components/resume-editor/`. Only the clicked line mounts a TipTap editor, built on a
custom `ResumeBullet` node whose attrs carry the block's provenance. Document-level undo/redo
(`useDocHistory`) covers finished edits, drag reorders (dnd-kit, within a job only), swaps, AI
rewrites and accepted suggestions alike. `useAutosave` PATCHes `/api/resume-docs/[id]` 800ms
after the last change with the version it edited; a stale version gets 409 and the editor
reloads. Each save writes `resume_document_history` (last 50 kept).
- Line AI: `POST /api/resume-docs/[id]/rewrite-block` streams a Haiku rewrite (shorter /
  stronger / their words / custom via "/" on an empty line) and fact-checks it before it sticks.
  The posting's wording is only in the prompt for their-words/custom: given it for shorter/stronger
  the model bolts on purposes the module never states, which the number/name check can't catch.
- Live fit: `src/lib/live-fit.ts` scores the doc text against `extracted_criteria` per keystroke
  (calibrated to the server scale, leave-one-out error ~6 points); after 10s idle
  `POST /api/resume-docs/[id]/fit` scores the saved doc with the match report's prompt
  (`src/lib/criteria-score.ts`, shared with `/api/match-report`), cached per version in
  `resume_documents.fit_report`, and the shown number re-anchors to it.
- Fact guard: each module-linked line is checked against its module 200ms after typing stops
  (`unsupportedTerms` in `fact-check.ts`); new numbers/names are flagged amber with "Add it to the
  module · Undo". Never blocks typing; downloading with open warnings asks once.
- Library write-back is opt-in per edit ("Save to your library too?").
- Suggestions: `POST /api/resume-docs/[id]/suggestions` returns block operations
  (`{ block_id, new_text, reason, module_id, based_on }`); Accept is a normal history commit.
- Older resumes (no document): "Make it editable" on `/resumes/[id]` and "Make editable" on
  `/resumes` call `POST /api/resume-docs/from-generated/[generatedResumeId]`, which rebuilds the doc
  from the same modules and JD through generate-resume's doc-only mode (one AI call, `ai_doc_from_legacy`,
  no new files or resume row, not counted against limits, 20/hour). Doc-only mode is honored only for
  in-process calls carrying `internal-call.ts`'s per-instance token. On demand only; no backfill.

## Eval suite (`npm run eval`)
`scripts/eval/run.ts` checks parsing and scoring against `test-resumes/` (8 level resumes + a scanned
PDF) and `scripts/eval/answer-key.ts` (from `test-resumes/answer-key-jd-levels.md`): jobs (company,
title, start year), no modules from Objective/Interests/References/Earlier Career, no module numbers
missing from the source, score ordering per JD, and a clear unreadable error for the scan. It runs the
real pipeline with `parseModules(..., { dryRun: true })` (writes nothing, no account needed), shared
text extraction (`src/lib/resume-text.ts`) and criteria (`src/lib/jd-criteria.ts`). JD fixtures live in
`scripts/eval/jds/` (the Anthropic one is still a placeholder; its checks skip). About 60 Haiku calls
per run, so not in CI. Output: stdout table + `scripts/eval/last-run.json` (gitignored).

## Library health (`/admin/library-health`)
Admin-only. Shows per-user parse damage (unlinked modules, multi-company modules, same-title
duplicates, job dates wider than their modules — `src/lib/library-health.ts`). "Preview fix" lists
every op (link to the job at the same normalized company, hide duplicate copies, multi-company →
career-level positioning, job dates from the latest resume outline) without writing. "Apply fix"
runs `apply_library_repair` (one transaction, ownership re-checked, `library_repairs` audit row with
the before-state); `undo_library_repair` restores it. Never automatic; other users' accounts need
their email typed and Matt's sign-off.

## Billing: `plan` vs `tier`
`users.plan` (`free`/`starter`/`pro`) is the Stripe-facing SKU bucket; `users.tier`
(`free`/`pro`/`beta_pro`) is the actual entitlement gate every feature check reads
(`isProTier()` in `src/lib/plan.ts` — upload limit, module limit, generation limit,
interview-prep, business AI-check caps, etc.). The Stripe webhook (`api/stripe/webhook`)
keeps both in sync on every subscription event, promoting/demoting `tier` alongside `plan`
but never overwriting a complimentary `beta_pro` grant. The admin `/admin` page's `PlanSelect`
dropdown (`PATCH /api/admin/users/[id]`, `{ plan }`) used to only write `plan`, silently
leaving `tier` on `free` — found via a real user stuck behind "Upload limit reached for your
plan" after being manually set to pro; 7 other accounts had the same drift (fixed via a one-off
`UPDATE` querying `plan = 'pro' and tier not in ('pro','beta_pro')`). The route now syncs
`tier` to match whenever `plan` is set to `pro` or `free` (same rule as the webhook: skip if
current `tier` is `beta_pro`; `starter` doesn't map to any tier so it's left alone). The newer
`/admin/users/[id]` page's `TierControl` (`POST /api/admin/set-user-tier`) always wrote `tier`
directly and was never affected — prefer it over the old `/admin` page's plan dropdown when
granting pro access manually.

## Gotchas
- `git add` with parentheses in paths trips up zsh — always use `git add -A`
- Sandbox leaves `.git/index.lock` files; delete from local machine before committing
- `onConflict` upserts require a real unique constraint in the DB — nullable columns in unique constraints need special handling (use DO $$ block to add constraints safely)
- `parse-modules.ts` uses admin client for job_experiences inserts (user client blocked by RLS)
- `/api/job-experiences` orders by `start_date DESC` — no `sort_order` column exists
- `CREATE TABLE IF NOT EXISTS` skips the entire statement if the table exists — add constraints separately, not inline
- A `useEffect` that reads-then-deletes a one-time token (sessionStorage, etc.) isn't idempotent — React Strict Mode double-invokes effects in dev only, so the second invocation sees it already gone and can misfire (e.g. `module-review`'s redirect-if-missing check bounced back to `/upload` on every single-role/short resume until guarded with a `hasLoadedOnceRef`). Production isn't affected (effects run once there), which is why this kind of bug only shows up in local dev testing.
