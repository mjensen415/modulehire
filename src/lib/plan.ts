export const FREE_LIMIT = 2
export const STARTER_LIMIT = 15

export function canGenerate(plan: string, count: number, overageCredits = 0): boolean {
  if (plan === 'pro') return true
  if (plan === 'starter') return count < STARTER_LIMIT
  return count < (FREE_LIMIT + overageCredits)
}

export function isAtFreeLimit(count: number, overageCredits = 0): boolean {
  return count >= (FREE_LIMIT + overageCredits)
}

export function moduleLimit(plan: string): number {
  if (plan === 'pro') return Infinity
  if (plan === 'starter') return 50
  return 20
}

export function uploadLimit(plan: string): number {
  if (plan === 'pro') return Infinity
  if (plan === 'starter') return 3
  return 1
}
