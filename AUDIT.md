# ModuleHire — Security & Operations Audit

_Date: 2026-07-07 · Scope: code review, live Supabase advisors, dependency audit, unauthenticated endpoint probing · Environment: production (`modulehire.com`, Supabase `ymrbpdhmtqimsvkowbco`, 21 users / 67 resumes live)_

## Bottom line

The codebase is in good shape for a solo-built beta. The security fundamentals most apps get wrong are already right here: RLS is enabled on all 16 tables, every API route authenticates, admin routes check `is_admin`, the Stripe webhook verifies signatures, checkout prices are server-controlled (no tampering), SSRF defenses exist on URL fetching, AI endpoints are per-user rate-limited, the cron secret uses timing-safe comparison, and `[id]` routes scope by `user_id` (no IDOR found). Secrets are gitignored.

The real risks are not classic code vulnerabilities — they are **(1) a framework version with active middleware-bypass CVEs**, and **(2) an open signup flow with no friction that exposes you to account-spam and AI-cost abuse the moment you leave invite-only.** Both matter specifically because you said you're preparing to open signup. Fix those two before you announce.

Severity uses: **Critical** (fix now) · **High** (fix before opening signup) · **Medium** (fix soon) · **Low** (hardening).

---

## Findings

### 1. [High] Next.js 16.2.4 has active middleware/proxy-bypass + CSP-nonce CVEs
`npm audit` flags `next@16.2.4` with **high**-severity advisories, several of which hit exactly the mechanisms this app depends on:

- _Middleware / Proxy bypass in App Router via segment-prefetch routes_ (and the incomplete-fix follow-up) — your entire page-level auth gate is `src/proxy.ts` → `updateSession`. A middleware bypass = unauthenticated access to protected pages.
- _Middleware / Proxy bypass through dynamic route parameter injection._
- _XSS in App Router applications using CSP nonces_ — you use per-request CSP nonces in `proxy.ts`.
- Plus DoS (image optimization, server components) and a transitive `postcss` XSS.

**Fix:** upgrade to `next@16.2.10` (`npm i next@16.2.10`), redeploy, re-run `npm audit`. This is the single highest-leverage fix in this report. [Certain] — advisories are version-matched to your lockfile.

**Caveat:** your page protection does _not_ rely on middleware alone — `(app)/layout.tsx` also does a server-side `getUser()` redirect, and every API route re-checks auth. So a middleware bypass would expose protected _pages_ but the layout check and per-route checks are a real second layer. Still upgrade; don't rely on defense-in-depth against a known bypass.

### 2. [High] Open signup has no anti-abuse friction
`/api/auth/signup` is unauthenticated and:

- has **no rate limit** (unlike every AI route, which is limited),
- **auto-confirms email** (`admin.createUser({ email_confirm: true })`) — no verification, so addresses are never proven,
- has **no CAPTCHA / bot check**,
- accepts any 8+ char password.

Each free account is then entitled to 25 AI resume generations/month plus parse/match/analyze/rewrite endpoints. Per-account cost is bounded by the rate limiters (good), but **account creation is unbounded**, so aggregate AI spend and DB growth are unbounded. A script can mint thousands of confirmed accounts.

**Fix, in order of value:**

1. Add a bot check to signup — Cloudflare Turnstile or hCaptcha (both have free tiers). This is the highest-leverage single change.
2. Require real email verification: create users with `email_confirm: false` and gate AI access on `email_confirmed_at`. This kills throwaway-address abuse and gives you a real contactable user list.
3. Rate-limit signup by IP using the `checkAndLogKey` helper + `rate_limits` table you already built (see #7) — e.g. 5/hour/IP.
4. Enable Supabase leaked-password protection (see #6).

[Certain] on the mechanics; [Likely] on abuse likelihood — you haven't been hit yet because you're invite-gated. This is the thing that changes the day you open up.

### 3. [Medium] Stripe webhook is not idempotent — duplicate deliveries double-grant credits
In `stripe/webhook/route.ts`, `checkout.session.completed` for one-time purchases calls `increment_resume_credits` (an **additive** RPC). Stripe delivers events **at-least-once** and retries; there is no dedup on `event.id`. A duplicate delivery grants the credits twice. Subscription events are safe (they set absolute state), but the credit path is not.

**Fix:** add a `stripe_events(id text primary key, processed_at timestamptz)` table; at the top of the handler, insert `event.id` and bail if it already exists (`ON CONFLICT DO NOTHING` → if no row inserted, return 200 without processing). [Certain].

### 4. [Medium] Failed credit grant is swallowed — paid user can end up with no credits
Same handler: if `increment_resume_credits` errors, it's `console.error`'d and the webhook still returns `{ ok: true }`. Stripe sees success and never retries, so a transient DB error = **customer paid, got nothing, and you have no alert.** Same pattern for the legacy path.

**Fix:** on RPC failure for a paid event, return a non-2xx so Stripe retries, _or_ record the failure to a durable outbox and alert. Pair with #3 so retries stay idempotent. [Certain].

### 5. [Medium] Two parallel checkout implementations
`/api/checkout` (legacy, creates Stripe customer inline, encodes `credits`/`type` in metadata) and `/api/billing/checkout` (newer, SKU→price map) both exist, and the webhook carries a "legacy path" to honor the old metadata shape. Two code paths for money = drift risk and double the surface to keep correct.

**Fix:** pick `/api/billing/checkout` as canonical, delete the other, remove the legacy webhook branch once no in-flight sessions use it. [Likely] this is dead-ish code but confirm nothing still calls `/api/checkout` before deleting.

### 6. [Medium] Supabase: leaked-password protection disabled
Security advisor: HaveIBeenPwned check is off. With open, low-friction signup and an 8-char minimum, users will reuse breached passwords. Enable it (Auth → Passwords). Consider raising the minimum or adding a strength meter. [Certain] — from live advisor. Remediation: https://supabase.com/docs/guides/auth/password-security

### 7. [Low] `beta-request` rate limiter is in-memory — ineffective on Vercel
`/api/beta-request` uses a module-scoped `Map` for rate limiting. On Vercel serverless each instance has its own map and cold starts reset it, so the limit barely applies. You already have the correct durable tool — `checkAndLogKey` + the `rate_limits` table — sitting unused.

**Fix:** replace the in-memory map with `checkAndLogKey(admin, ip, 'rl_beta_request', 5, 3600)`. Wire the same helper into `/api/auth/signup` (#2). [Certain].

### 8. [Low] `increment_resume_credits` has a mutable `search_path`
Advisor WARN. A `SECURITY`-sensitive function without a pinned `search_path` is theoretically hijackable via schema manipulation. Low real risk here, but trivial to harden: `ALTER FUNCTION public.increment_resume_credits(uuid, integer) SET search_path = public, pg_temp;`. [Certain] — from live advisor.

### 9. [Low] DNS-rebinding TOCTOU in `fetch-jd-url`
`validateExternalUrl` resolves DNS and rejects private IPs, then `fetch()` resolves DNS **again** independently. An attacker controlling their DNS can return a public IP during validation and a private IP at fetch time, defeating the SSRF check. `redirect: 'manual'` and the allowlist reduce but don't close this.

**Fix:** resolve once, verify the address is public, then fetch that pinned IP with the original Host header (or use an SSRF-safe fetch agent). Low priority — requires a targeted attacker and only yields blind-ish SSRF — but note it. [Likely].

### 10. [Info] Two RLS-enabled-no-policy tables — intentional, leave as-is
Advisor flags `beta_requests` and `rate_limits` as RLS-on / no-policy. That's a **deny-all to non-service-role**, which is the correct posture for tables only touched by the admin client. No action needed; noting so it's not re-flagged as a gap.

---

## What's already done well (don't regress these)

RLS enabled on all 16 tables · per-request CSP with `strict-dynamic` nonce · CORS locked to an origin allowlist · full security-header set (`X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy) · SSRF protections (DNS resolution, RFC1918/link-local/metadata blocking, no redirects, size + content-type caps) · every AI endpoint auth-gated **and** per-user rate-limited · Stripe webhook signature verification on raw body · server-side price control (users pass a SKU key, never a price) · UUID validation on webhook metadata · timing-safe cron-secret comparison · `[id]` routes scoped by `user_id` · admin routes gated on `is_admin` · secrets gitignored (`.env*`), only `.env.local.example` committed.

---

## Operational recommendations (beyond security)

**Observability is the biggest gap after the fixes above.** Right now failures are `console.error` only — you'd never know a webhook dropped a paid credit (#4) or that AI calls started erroring. Before opening signup, add:

- **Sentry** (or equivalent) for server errors, with alerts on the Stripe webhook path specifically.
- A cost guardrail on AI spend — an Anthropic/OpenAI budget alert, and a daily query on `usage_events` to catch abuse spikes early.
- **Idempotency + an events/outbox table** for Stripe (covers #3 and #4 together).

**Rate-limiter design.** `checkAndLog` does a `count` then `insert` — it self-documents a race window and writes a row per call into `usage_events` (already 225 rows and growing as your rate-limit ledger). It's fine at current scale, but as you grow, a dedicated store (Upstash/Vercel KV, or a Postgres function that counts-and-inserts atomically) will be more accurate and won't bloat `usage_events`. Not urgent.

**Migration drift.** `CLAUDE.md` lists several migrations "applied to Supabase but NOT yet in schema.sql" (`resume_credits`, the `increment_resume_credits` function, RLS policies on the four newer tables). A fresh deploy from source would miss them. Reconcile `schema.sql` / the `supabase/migrations` folder with prod so the repo is the source of truth. This is a real "run the site better" item — you're one clean-clone away from a broken environment.

**Auth secondary checks.** Keep the `(app)/layout.tsx` server-side `getUser()` redirect even after upgrading Next — it's your backstop if middleware is ever bypassed again. Good pattern; make it a rule.

---

## Suggested order of work

1. `npm i next@16.2.10`, redeploy, re-run `npm audit` (#1). ~15 min.
2. Enable Supabase leaked-password protection (#6) + pin function search_path (#8). ~10 min, both in dashboard/SQL.
3. Add Turnstile/hCaptcha + IP rate-limit to signup; require email verification before AI access (#2, #7). Half a day — do before announcing open signup.
4. Stripe idempotency + fail-loud on credit grant (#3, #4). Half a day.
5. Wire Sentry + an AI cost alert. Half a day.
6. Consolidate checkout routes (#5), reconcile migrations, address DNS-rebinding (#9). Cleanup pass.

_Not verified in this pass (tooling limits): live HTTP status codes / response headers on protected endpoints (probing confirmed no data leaks unauthenticated, but couldn't read status/headers), and runtime behavior under load. The findings above are from source, the live Supabase advisors, and the dependency tree._
