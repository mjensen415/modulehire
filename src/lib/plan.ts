export const FREE_LIMIT = 0  // free users get no free downloads

// Generation is always allowed — free users get a preview
export function canGenerate(): boolean {
  return true
}

// Download requires credits or pro subscription
export function canDownload(plan: string, resumeCredits = 0): boolean {
  if (plan === 'pro') return true
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
