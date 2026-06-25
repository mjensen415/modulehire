export const FREE_MONTHLY_GENERATIONS = 25

// True when the user has Pro-equivalent access (paid Pro or complimentary beta_pro).
// This is the single entitlement gate — everything below derives from it.
export function isProTier(tier?: string | null): boolean {
  return tier === 'pro' || tier === 'beta_pro'
}

// Generation is always allowed — free users get a preview
export function canGenerate(): boolean {
  return true
}

// Monthly generation gate for free users; pro/beta_pro are unlimited.
export function canGenerateThisMonth(tier: string | null | undefined, monthlyCount: number): boolean {
  if (isProTier(tier)) return true
  return monthlyCount < FREE_MONTHLY_GENERATIONS
}

// Free users can always download what they generated. The monthly generation
// quota (canGenerateThisMonth) is the only gate — there is no download paywall.
export function canDownload(): boolean {
  return true
}

export function moduleLimit(tier?: string | null): number {
  return isProTier(tier) ? Infinity : 20
}

export function uploadLimit(tier?: string | null): number {
  return isProTier(tier) ? Infinity : 1
}

// ─── Saved-resume storage soft limits ────────────────────────────────────────
// Non-blocking nudge surfaced as an in-app banner on /resumes. We warn on
// "whichever hits first": a saved-resume count cap OR a total storage cap.
// Resumes are never auto-deleted and generation is never blocked by these.
export const RESUME_COUNT_LIMIT = 25
export const RESUME_BYTES_LIMIT = 50 * 1024 * 1024 // 50 MB
const STORAGE_WARN_RATIO = 0.8 // start warning at 80% of either cap

export type StorageUsage = {
  resume_count: number
  bytes: number
  count_limit: number
  byte_limit: number
  near: boolean // approaching either cap (>= 80%)
  over: boolean // at/over either cap
}

export function computeStorageUsage(resume_count: number, bytes: number): StorageUsage {
  const over = resume_count >= RESUME_COUNT_LIMIT || bytes >= RESUME_BYTES_LIMIT
  const near =
    over ||
    resume_count >= RESUME_COUNT_LIMIT * STORAGE_WARN_RATIO ||
    bytes >= RESUME_BYTES_LIMIT * STORAGE_WARN_RATIO
  return {
    resume_count,
    bytes,
    count_limit: RESUME_COUNT_LIMIT,
    byte_limit: RESUME_BYTES_LIMIT,
    near,
    over,
  }
}
