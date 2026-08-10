# ModuleHire — Audit Action Plan

_Derived from `AUDIT.md` (2026-07-07). Ordered so you can work top to bottom. Each item has: what to do, done-when (acceptance criteria), effort, and the audit finding it closes._

**Guiding rule:** everything in Phase 0 and Phase 1 must ship **before you announce open signup.** Phases 2–4 can follow.

---

## Phase 0 — Quick wins (one sitting, ~40 min)

- [x] **P0.1 — Upgrade Next.js to patch middleware-bypass CVEs** _(closes #1, High)_ ✅ 2026-07-07: on `16.2.10`, `npm audit` high/critical = 0, typecheck clean. (Prod build to run on Vercel deploy — couldn't build in sandbox due to `.next` FUSE lock.)
  - Steps: `npm i next@16.2.10 eslint-config-next@16.2.10` → `npm run build` locally → deploy → `npm audit` (expect the `next`/`postcss` high+moderate to clear).
  - Done when: `npm audit` shows no `next` advisories; site builds and protected pages still redirect when logged out.
  - Effort: 15 min. Risk: low (patch release, same major).

- [ ] **P0.2 — Enable Supabase leaked-password protection** _(closes #6, Medium)_ ⏳ NEEDS YOU: dashboard-only toggle (not scriptable via MCP). Steps below.
  - Steps: Supabase Dashboard → Authentication → Passwords → enable "Leaked password protection" (HaveIBeenPwned). Optionally raise min length to 10.
  - Done when: advisor no longer flags `auth_leaked_password_protection`.
  - Effort: 5 min.

- [x] **P0.3 — Pin `increment_resume_credits` search_path** _(closes #8, Low)_ ✅ 2026-07-07: applied to prod + verified (`search_path=public, pg_temp`); migration committed at `supabase/migrations/20260707_pin_increment_resume_credits_search_path.sql`. Advisor warning cleared.
  - Steps: run `ALTER FUNCTION public.increment_resume_credits(uuid, integer) SET search_path = public, pg_temp;`
  - Done when: advisor no longer flags `function_search_path_mutable`.
  - Effort: 2 min. (Add this to a migration file too — see P4.3.)

- [x] **P0.4 — Re-run advisors + audit to confirm Phase 0** ✅ 2026-07-07: `npm audit` high=0/critical=0 (remaining: 1 low + 4 moderate, all dev-only or unused-feature). Supabase advisor clean except the 2 intentional deny-all tables (INFO) + P0.2 pending.
  - Done when: Supabase security advisor is clean except the two intentional deny-all tables; `npm audit` high-severity count is 0.

---

## Phase 1 — Signup hardening (before opening signup, ~half day)

_This is the phase that actually gates the launch. Right now open signup = unbounded fake accounts + AI cost (#2)._

- [x] **P1.1 — Add a bot check to signup** _(closes part of #2, High)_ ✅ 2026-07-07: Turnstile wired end-to-end — widget in `(auth)/signin/page.tsx`, server verify in `/api/auth/signup` via `src/lib/turnstile.ts`, CSP updated in `proxy.ts` for `challenges.cloudflare.com`. **Inert until you add `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`** (create a site in Cloudflare → Turnstile). No-op without the secret so dev isn't blocked.

- [x] **P1.2 — Require real email verification before AI access** _(closes part of #2, High)_ ✅ 2026-07-07: Built app-level (not Supabase-native, which would block login). New files: `src/lib/email.ts` (Brevo transactional send), `src/lib/email-verification.ts` (create-unconfirmed + send + `needsEmailVerification` gate). Signup branches on the flag; `/api/generate-resume` blocks unverified with `code: 'email_unverified'`; `/api/auth/resend-verification` added. UX = browse-but-can't-generate (parse/library stay open). **Ships DORMANT behind `REQUIRE_EMAIL_VERIFICATION=false`.** To activate, do all three: (1) set `EMAIL_FROM` to a **verified Brevo sender**; (2) Supabase → Auth → Email → turn **"Confirm email" OFF** (so unconfirmed users can still log in); (3) set `REQUIRE_EMAIL_VERIFICATION=true`. Remaining polish (non-blocking): a "check your inbox / resend" banner in the app UI — API is ready, just needs wiring.

- [x] **P1.3 — IP rate-limit signup** _(closes part of #2 + #7, High/Low)_ ✅ 2026-07-07: `/api/auth/signup` now throttles 5/hour/IP via `checkAndLogKey` on the durable `rate_limits` table. Active immediately (no config needed).

- [x] **P1.4 — Replace `beta-request` in-memory limiter with the durable one** _(closes #7, Low)_ ✅ 2026-07-07: `/api/beta-request` swapped from the per-instance `Map` to `checkAndLogKey(..., 'rl_beta_request', 5, 3600)`. Now survives serverless cold starts. Active immediately.

---

## Phase 2 — Payment integrity (this week, ~half day)

- [ ] **P2.1 — Make the Stripe webhook idempotent** _(closes #3, Medium)_
  - Steps: create `stripe_events(id text primary key, type text, processed_at timestamptz default now())`; at the top of the handler, `insert ... on conflict do nothing`; if no row was inserted, return 200 without processing.
  - Done when: replaying the same `checkout.session.completed` event grants credits exactly once (test with Stripe CLI `stripe trigger` / resend).
  - Effort: 2 hrs.

- [ ] **P2.2 — Fail loud on credit-grant errors** _(closes #4, Medium)_
  - Steps: in the one-time-purchase branch, if `increment_resume_credits` returns an error, return a non-2xx so Stripe retries (safe now that P2.1 makes retries idempotent); log + alert.
  - Done when: a simulated RPC failure causes a Stripe retry rather than a silent `{ ok: true }`; the failure is visible in your error tracker (P3.1).
  - Effort: 1 hr. Depends on: P2.1.

---

## Phase 3 — Observability (this week, ~half day)

_You currently have no way to know a paid credit was dropped or that AI calls are erroring._

- [ ] **P3.1 — Add Sentry (or equivalent) for server errors**
  - Steps: install `@sentry/nextjs`; wire it; add a dedicated alert on the `/api/stripe/webhook` path.
  - Done when: a thrown error in an API route shows up in Sentry with an alert.
  - Effort: 2 hrs.

- [ ] **P3.2 — AI cost + abuse guardrail**
  - Steps: set a budget alert in the Anthropic/OpenAI console; add a daily check on `usage_events` (count of AI actions/day, top users) — either a scheduled query or a small cron route. Alert on spikes.
  - Done when: an abnormal spike in generations/day triggers a notification.
  - Effort: 2 hrs. (Can be a scheduled task once built.)

---

## Phase 4 — Cleanup & hardening (backlog, non-blocking)

- [ ] **P4.1 — Consolidate checkout routes** _(closes #5, Medium)_
  - Steps: confirm nothing calls `/api/checkout` (grep client + logs); delete it; remove the legacy branch in the webhook once no in-flight sessions use the old metadata shape.
  - Done when: one checkout route remains; webhook legacy path removed; payments still work end to end.
  - Effort: 1–2 hrs.

- [ ] **P4.2 — Close the DNS-rebinding TOCTOU in `fetch-jd-url`** _(closes #9, Low)_
  - Steps: resolve DNS once, verify the address is public, fetch the pinned IP with the original Host header (or use an SSRF-safe agent).
  - Done when: validation and fetch cannot resolve to different IPs.
  - Effort: 1–2 hrs.

- [ ] **P4.3 — Reconcile migrations with `schema.sql`** _(ops, from audit)_
  - Steps: add the prod-only migrations noted in `CLAUDE.md` (`resume_credits` column, `increment_resume_credits` fn incl. the P0.3 search_path, RLS policies on the four newer tables) into `supabase/migrations` / `schema.sql`. Verify a clean clone reproduces prod schema.
  - Done when: a fresh `supabase db reset` produces a schema matching production.
  - Effort: 2–3 hrs. **Do before any fresh deploy.**

- [ ] **P4.5 — Clean up lint violations surfaced by the Next 16.2.10 bump** _(tech debt, non-blocking)_
  - Context: `eslint-config-next@16.2.10` promoted newer `react-hooks` rules to errors (`react-hooks/error-boundaries` on react-pdf JSX in try/catch in `generate-resume/route.tsx`; `set-state-in-effect` elsewhere). **These do NOT block deploys** — Next 16 no longer runs ESLint during `next build` — but `npm run lint` now reports them.
  - Steps: run `npm run lint`, triage; wrap the react-pdf rendering so JSX isn't constructed inside try/catch, and resolve remaining set-state-in-effect cases.
  - Done when: `npm run lint` is clean (or intentional cases have scoped disables).
  - Effort: 2–4 hrs.

- [ ] **P4.4 — Rate-limiter store upgrade** _(ops, non-urgent)_
  - Steps: when scale warrants, move `checkAndLog` off the `usage_events` count→insert pattern to an atomic store (Upstash/Vercel KV or a count-and-insert Postgres function) to remove the race window and stop bloating `usage_events`.
  - Done when: rate limiting no longer writes a ledger row per call to `usage_events`.
  - Effort: half day. Trigger: when `usage_events` growth or limiter accuracy becomes a problem.

---

## At-a-glance sequence

| Phase | Blocks launch? | Effort | Items |
|---|---|---|---|
| 0 — Quick wins | Yes | ~40 min | P0.1–P0.4 |
| 1 — Signup hardening | **Yes** | ~half day | P1.1–P1.4 |
| 2 — Payment integrity | No (do this week) | ~half day | P2.1–P2.2 |
| 3 — Observability | No (do this week) | ~half day | P3.1–P3.2 |
| 4 — Cleanup | No (backlog) | ~1–2 days | P4.1–P4.4 |

**Critical path to open signup:** Phase 0 → Phase 1. Everything else can follow the launch.

## Decisions you need to make
1. **P1.2:** unverified users — hard-block the app, or let them browse but not generate? (Affects UX + conversion.)
2. **P3.1:** Sentry vs. another error tracker (Highlight, Axiom, Vercel's built-in). Sentry is the default recommendation.
3. **P1.1:** Turnstile vs. hCaptcha. Turnstile is lighter and free; recommended.
