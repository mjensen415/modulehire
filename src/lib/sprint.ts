// Sprint SKUs. Prices come from env (STRIPE_PRICE_SPRINT_30 / _90, set in Vercel); never hardcoded.
export const SPRINT_SKUS = {
  sprint_30: { days: 30, priceEnv: 'STRIPE_PRICE_SPRINT_30', label: '30-day Sprint', price: 19 },
  sprint_90: { days: 90, priceEnv: 'STRIPE_PRICE_SPRINT_90', label: '90-day Sprint', price: 45 },
} as const
export type SprintSku = keyof typeof SPRINT_SKUS

export function isSprintSku(v: unknown): v is SprintSku {
  return v === 'sprint_30' || v === 'sprint_90'
}
