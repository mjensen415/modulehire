// AI cost and abuse guardrail (ACTION-PLAN P3.2). Estimates spend from the token counts
// that aiComplete/aiCompleteJson/aiStream log to usage_events.metadata, compares the last
// 24 hours with the 7 days before, and lists the heaviest users. Pure functions here; the
// cron route (/api/cron/ai-usage) fetches rows and sends the email.

/** USD per million tokens. Unknown models are priced like Sonnet so an estimate never undercounts. */
const PRICES: { match: RegExp; input: number; output: number }[] = [
  { match: /haiku/i, input: 1, output: 5 },
  { match: /sonnet/i, input: 3, output: 15 },
  { match: /opus/i, input: 5, output: 25 },
]
const FALLBACK = { input: 3, output: 15 }
const CACHE_READ = 0.1
const CACHE_WRITE = 1.25

export type UsageRow = {
  user_id: string | null
  created_at: string
  metadata: Record<string, unknown> | null
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : 0
  return Number.isFinite(n) ? n : 0
}

export function rowCostUsd(meta: Record<string, unknown> | null): number {
  if (!meta || typeof meta.model !== 'string') return 0
  const p = PRICES.find((x) => x.match.test(meta.model as string)) ?? FALLBACK
  const input = num(meta.input_tokens)
  const output = num(meta.output_tokens)
  const cacheRead = num(meta.cache_read_input_tokens)
  const cacheWrite = num(meta.cache_creation_input_tokens)
  return (
    (input * p.input + cacheRead * p.input * CACHE_READ + cacheWrite * p.input * CACHE_WRITE + output * p.output) /
    1_000_000
  )
}

export type Thresholds = {
  /** Alert when the last 24h costs more than this, whatever the baseline. */
  dayUsd: number
  /** Alert when the last 24h is this many times the 7-day daily average... */
  spikeRatio: number
  /** ...and above this floor, so tiny days don't page anyone. */
  spikeFloorUsd: number
  /** Alert when one user costs more than this in 24h. */
  userUsd: number
  /** Alert when one user makes more than this many AI calls in 24h. */
  userCalls: number
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  dayUsd: 10,
  spikeRatio: 3,
  spikeFloorUsd: 2,
  userUsd: 2,
  userCalls: 300,
}

export type UsageReport = {
  windowEnd: string
  last24h: { calls: number; usd: number }
  prior7dAvg: { calls: number; usd: number }
  topUsers: { user_id: string; calls: number; usd: number }[]
  reasons: string[]
}

export function buildReport(rows: UsageRow[], now: Date, t: Thresholds = DEFAULT_THRESHOLDS): UsageReport {
  const dayAgo = now.getTime() - 24 * 3600 * 1000
  const eightDaysAgo = now.getTime() - 8 * 24 * 3600 * 1000
  let calls24 = 0
  let usd24 = 0
  let callsPrior = 0
  let usdPrior = 0
  const perUser = new Map<string, { calls: number; usd: number }>()

  for (const r of rows) {
    const at = Date.parse(r.created_at)
    if (!Number.isFinite(at) || at < eightDaysAgo || at > now.getTime()) continue
    const usd = rowCostUsd(r.metadata)
    if (at >= dayAgo) {
      calls24 += 1
      usd24 += usd
      const key = r.user_id ?? 'unknown'
      const u = perUser.get(key) ?? { calls: 0, usd: 0 }
      u.calls += 1
      u.usd += usd
      perUser.set(key, u)
    } else {
      callsPrior += 1
      usdPrior += usd
    }
  }

  const avgUsd = usdPrior / 7
  const avgCalls = callsPrior / 7
  const topUsers = [...perUser.entries()]
    .map(([user_id, v]) => ({ user_id, ...v }))
    .sort((a, b) => b.usd - a.usd)
    .slice(0, 5)

  const reasons: string[] = []
  if (usd24 > t.dayUsd) reasons.push(`Last 24h estimated at $${usd24.toFixed(2)}, over the $${t.dayUsd} daily ceiling.`)
  if (usd24 > t.spikeFloorUsd && usd24 > avgUsd * t.spikeRatio) {
    reasons.push(`Last 24h ($${usd24.toFixed(2)}) is more than ${t.spikeRatio}x the 7-day daily average ($${avgUsd.toFixed(2)}).`)
  }
  for (const u of topUsers) {
    if (u.usd > t.userUsd) reasons.push(`User ${u.user_id} cost $${u.usd.toFixed(2)} in 24h (limit $${t.userUsd}).`)
    else if (u.calls > t.userCalls) reasons.push(`User ${u.user_id} made ${u.calls} AI calls in 24h (limit ${t.userCalls}).`)
  }

  return {
    windowEnd: now.toISOString(),
    last24h: { calls: calls24, usd: round(usd24) },
    prior7dAvg: { calls: round(avgCalls), usd: round(avgUsd) },
    topUsers: topUsers.map((u) => ({ ...u, usd: round(u.usd) })),
    reasons,
  }
}

function round(n: number) {
  return Math.round(n * 100) / 100
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export function reportEmailHtml(r: UsageReport, emails: Record<string, string>): string {
  const rows = r.topUsers
    .map(
      (u) =>
        `<tr><td style="padding:4px 10px 4px 0">${esc(emails[u.user_id] ?? u.user_id)}</td><td style="padding:4px 10px">${u.calls}</td><td style="padding:4px 0">$${u.usd.toFixed(2)}</td></tr>`,
    )
    .join('')
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1c1e1b;line-height:1.5">
<p><strong>ModuleHire AI usage alert</strong></p>
<ul>${r.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
<p>Last 24h: ${r.last24h.calls} calls, about $${r.last24h.usd.toFixed(2)}. Prior 7-day daily average: ${r.prior7dAvg.calls} calls, about $${r.prior7dAvg.usd.toFixed(2)}.</p>
<p><strong>Top users, last 24h</strong></p>
<table style="font-size:13px;border-collapse:collapse"><tr><th align="left">User</th><th align="left">Calls</th><th align="left">Est. cost</th></tr>${rows}</table>
<p style="color:#666;font-size:12px">Estimates from logged token counts (usage_events.metadata). Calls without a userId aren't logged, so the real bill can be higher. Check the Anthropic console for actual spend.</p>
</div>`
}
