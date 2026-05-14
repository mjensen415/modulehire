export const FREE_LIMIT = 2

// A user can generate if: they're pro, OR they have resume_credits > 0,
// OR they're free and under the monthly limit.
export function canGenerate(plan: string, monthlyCount: number, resumeCredits = 0): boolean {
  if (plan === 'pro') return true
  if (resumeCredits > 0) return true
  return monthlyCount < FREE_LIMIT
}

export function moduleLimit(plan: string): number {
  if (plan === 'pro') return Infinity
  return 20
}

export function uploadLimit(plan: string): number {
  if (plan === 'pro') return Infinity
  return 1
}
