export const FREE_LIMIT = 0  // free users get no free downloads
export const FREE_MONTHLY_GENERATIONS = 2

// True when the user has Pro-equivalent access (paid Pro or complimentary beta_pro).
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

// Download requires credits or pro subscription
export function canDownload(plan: string, resumeCredits = 0): boolean {
  if (plan === 'pro' || plan === 'starter' || plan === 'unknown') return true
  return resumeCredits > 0
}

export function moduleLimit(plan: string): number {
  if (plan === 'pro') return Infinity
  return 20
}

export function uploadLimit(plan: string): number {
  if (plan === 'pro') return Infinity
  return 1
}
