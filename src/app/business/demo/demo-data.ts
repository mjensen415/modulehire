// Fictional sample data for the public demo at /business/demo. No real people or
// companies. Overall scores are computed with the same rule the real scorer is told
// to use (score-applicant.ts): dealbreaker 3x, must-have 2x, nice-to-have 1x, capped
// at 25 when a dealbreaker is not met. Nothing here calls the AI.

export type DemoWeight = 'dealbreaker' | 'must_have' | 'nice_to_have'

export type DemoCriterion = {
  id: string
  label: string
  weight: DemoWeight
  type: 'experience' | 'skill'
  minYears?: number
}

export type DemoScore = { criterionId: string; score: number; met: boolean; evidence: string }

export type DemoApplicant = {
  id: string
  name: string
  headline: string
  status: 'New' | 'Shortlisted' | 'Interviewing' | 'Rejected'
  scores: DemoScore[]
}

export const DEMO_JOB = {
  title: 'Senior Product Manager, Payments',
  company: 'Lumen Freight (sample company)',
  location: 'Remote, US',
}

export const DEMO_CRITERIA: DemoCriterion[] = [
  { id: 'c1', label: 'Product management experience', weight: 'dealbreaker', type: 'experience', minYears: 5 },
  { id: 'c2', label: 'Shipped payments or billing products', weight: 'must_have', type: 'skill' },
  { id: 'c3', label: 'Works from data: SQL, experiments, metrics', weight: 'must_have', type: 'skill' },
  { id: 'c4', label: 'Led cross-functional teams with engineering', weight: 'must_have', type: 'skill' },
  { id: 'c5', label: 'B2B or logistics domain', weight: 'nice_to_have', type: 'skill' },
  { id: 'c6', label: 'Compliance exposure (PCI, SOC 2)', weight: 'nice_to_have', type: 'skill' },
]

export const DEMO_APPLICANTS: DemoApplicant[] = [
  {
    id: 'a1', name: 'Priya Okafor', headline: 'Senior PM at a B2B billing platform, 8 years in product', status: 'Shortlisted',
    scores: [
      { criterionId: 'c1', score: 100, met: true, evidence: '"Senior Product Manager, 2019 to present" plus "Product Manager, 2016 to 2019"' },
      { criterionId: 'c2', score: 95, met: true, evidence: '"Launched usage-based invoicing used by 1,400 business customers"' },
      { criterionId: 'c3', score: 85, met: true, evidence: '"Ran 30+ pricing-page experiments; wrote the SQL behind our weekly revenue review"' },
      { criterionId: 'c4', score: 90, met: true, evidence: '"Led a squad of 9 engineers and 2 designers through a ledger rewrite"' },
      { criterionId: 'c5', score: 70, met: true, evidence: '"All customers are mid-market B2B companies"' },
      { criterionId: 'c6', score: 60, met: true, evidence: '"Product owner for our SOC 2 Type II audit"' },
    ],
  },
  {
    id: 'a2', name: 'Marcus Lindqvist', headline: 'Group PM at a freight marketplace, 7 years in product', status: 'Interviewing',
    scores: [
      { criterionId: 'c1', score: 100, met: true, evidence: '"7 years in product management across two marketplaces"' },
      { criterionId: 'c2', score: 70, met: true, evidence: '"Owned carrier payouts: moved weekly payouts to same-day"' },
      { criterionId: 'c3', score: 80, met: true, evidence: '"Built the dashboard leadership uses for take-rate and payout latency"' },
      { criterionId: 'c4', score: 85, met: true, evidence: '"Managed 3 PMs and partnered with 4 engineering teams"' },
      { criterionId: 'c5', score: 100, met: true, evidence: '"Freight marketplace connecting shippers and 20,000 carriers"' },
      { criterionId: 'c6', score: 0, met: false, evidence: 'not found in resume' },
    ],
  },
  {
    id: 'a3', name: 'Dana Whitfield', headline: 'PM at a consumer fintech app, 5 years in product', status: 'New',
    scores: [
      { criterionId: 'c1', score: 100, met: true, evidence: '"Product Manager, 2020 to present"; "Associate PM, 2019 to 2020"' },
      { criterionId: 'c2', score: 80, met: true, evidence: '"Shipped instant transfers and card controls"' },
      { criterionId: 'c3', score: 60, met: true, evidence: '"Defined success metrics with the analytics team"' },
      { criterionId: 'c4', score: 55, met: false, evidence: '"Worked closely with engineering on launches" (no team leadership named)' },
      { criterionId: 'c5', score: 10, met: false, evidence: 'consumer products only' },
      { criterionId: 'c6', score: 50, met: true, evidence: '"Coordinated PCI scope review for the card launch"' },
    ],
  },
  {
    id: 'a4', name: 'Tomás Herrera', headline: 'Engineering lead moving into product, 2 years as PM', status: 'New',
    scores: [
      { criterionId: 'c1', score: 40, met: false, evidence: '"Product Manager, 2023 to present" (about 2 years, minimum is 5)' },
      { criterionId: 'c2', score: 85, met: true, evidence: '"Tech lead on the checkout and refunds service"' },
      { criterionId: 'c3', score: 90, met: true, evidence: '"Instrumented checkout funnel; SQL and Looker daily"' },
      { criterionId: 'c4', score: 75, met: true, evidence: '"Led 6 engineers before moving to product"' },
      { criterionId: 'c5', score: 40, met: false, evidence: '"B2C marketplace"' },
      { criterionId: 'c6', score: 70, met: true, evidence: '"Implemented PCI tokenization for stored cards"' },
    ],
  },
  {
    id: 'a5', name: 'Grace Nakamura', headline: 'Senior PM in HR software, 9 years in product', status: 'New',
    scores: [
      { criterionId: 'c1', score: 100, met: true, evidence: '"Nine years leading product at two SaaS companies"' },
      { criterionId: 'c2', score: 25, met: false, evidence: '"Partnered with finance on plan packaging" (no payments product shipped)' },
      { criterionId: 'c3', score: 75, met: true, evidence: '"Ran A/B tests on onboarding; owned activation metrics"' },
      { criterionId: 'c4', score: 90, met: true, evidence: '"Led a 14-person product and engineering group"' },
      { criterionId: 'c5', score: 80, met: true, evidence: '"Enterprise B2B HR platform"' },
      { criterionId: 'c6', score: 65, met: true, evidence: '"Drove SOC 2 readiness work with security"' },
    ],
  },
  {
    id: 'a6', name: 'Owen Castillo', headline: 'Marketing manager with product interest, no PM title', status: 'Rejected',
    scores: [
      { criterionId: 'c1', score: 0, met: false, evidence: 'not found in resume' },
      { criterionId: 'c2', score: 20, met: false, evidence: '"Wrote launch emails for a payments feature"' },
      { criterionId: 'c3', score: 55, met: true, evidence: '"Owned campaign attribution reporting"' },
      { criterionId: 'c4', score: 40, met: false, evidence: '"Worked with product on launch timing"' },
      { criterionId: 'c5', score: 60, met: true, evidence: '"B2B SaaS marketing"' },
      { criterionId: 'c6', score: 0, met: false, evidence: 'not found in resume' },
    ],
  },
]

const WEIGHT_MULT: Record<DemoWeight, number> = { dealbreaker: 3, must_have: 2, nice_to_have: 1 }

export function overallScore(a: DemoApplicant): number {
  let total = 0
  let weights = 0
  let dealbreakerMissed = false
  for (const c of DEMO_CRITERIA) {
    const s = a.scores.find((x) => x.criterionId === c.id)
    if (!s) continue
    total += s.score * WEIGHT_MULT[c.weight]
    weights += WEIGHT_MULT[c.weight]
    if (c.weight === 'dealbreaker' && !s.met) dealbreakerMissed = true
  }
  const raw = weights ? Math.round(total / weights) : 0
  return dealbreakerMissed ? Math.min(raw, 25) : raw
}

export function hasDealbreakerMiss(a: DemoApplicant): boolean {
  return DEMO_CRITERIA.some((c) => c.weight === 'dealbreaker' && !a.scores.find((s) => s.criterionId === c.id)?.met)
}
