// Job tracker signal: where an application went, how old the posting was, and when/how the
// user first heard back. Shared by the tracker API routes, /job-tracker, and the "Add to
// tracker" card on /generate. Everything here is computed on read — no cron.

export const APPLICATION_SOURCES = [
  { value: 'company_site', label: 'Company site' },
  { value: 'linkedin_easy_apply', label: 'LinkedIn Easy Apply' },
  { value: 'linkedin_external', label: 'LinkedIn → company site' },
  { value: 'job_board', label: 'Job board' },
  { value: 'referral', label: 'Referral' },
  { value: 'recruiter', label: 'Recruiter' },
  { value: 'other', label: 'Other' },
] as const
export type ApplicationSource = typeof APPLICATION_SOURCES[number]['value']

export const POSTING_AGES = [
  { value: 'today', label: 'Today' },
  { value: '1_3_days', label: '1–3 days' },
  { value: '4_7_days', label: '4–7 days' },
  { value: '1_2_weeks', label: '1–2 weeks' },
  { value: '2_plus_weeks', label: '2+ weeks' },
] as const
export type PostingAge = typeof POSTING_AGES[number]['value']

export const RESPONSE_TYPES = ['auto_reject', 'human_reject', 'recruiter_screen', 'interview', 'offer'] as const
export type ResponseType = typeof RESPONSE_TYPES[number]

export function isApplicationSource(v: unknown): v is ApplicationSource {
  return APPLICATION_SOURCES.some(s => s.value === v)
}
export function isPostingAge(v: unknown): v is PostingAge {
  return POSTING_AGES.some(s => s.value === v)
}
export function isResponseType(v: unknown): v is ResponseType {
  return (RESPONSE_TYPES as readonly string[]).includes(v as string)
}

export function sourceLabel(v: string | null | undefined): string {
  return APPLICATION_SOURCES.find(s => s.value === v)?.label ?? 'Not recorded'
}
export function postingAgeLabel(v: string | null | undefined): string {
  return POSTING_AGES.find(s => s.value === v)?.label ?? 'Not sure'
}

// Statuses that mean the user heard back. Rejected is the only one that needs the user to say
// whether it was automated or from a person.
export const RESPONSE_STATUSES = ['screening', 'interviewing', 'offered', 'rejected'] as const
export function responseTypeForStatus(status: string, rejectKind: 'auto_reject' | 'human_reject' = 'auto_reject'): ResponseType | null {
  switch (status) {
    case 'screening': return 'recruiter_screen'
    case 'interviewing': return 'interview'
    case 'offered': return 'offer'
    case 'rejected': return rejectKind
    default: return null
  }
}

const WORD_NUMBERS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 }

function daysToBucket(days: number): PostingAge {
  if (days < 1) return 'today'
  if (days <= 3) return '1_3_days'
  if (days <= 7) return '4_7_days'
  if (days <= 14) return '1_2_weeks'
  return '2_plus_weeks'
}

/**
 * Reads "Posted 3 days ago" / "Reposted 2 weeks ago" / "Posted today" out of a pasted JD.
 * Rare in practice (~4% of saved JDs) but free when present. Returns null when not found.
 */
export function parsePostingAge(text: string | null | undefined): PostingAge | null {
  if (!text) return null
  const head = text.slice(0, 20_000)
  if (/\b(?:re)?posted\s+(?:today|just now)\b/i.test(head)) return 'today'
  const m = head.match(/\b(?:re)?posted\s+(?:about\s+|over\s+)?(\d+|an?|one|two|three|four|five|six|seven)\+?\s+(minute|hour|day|week|month)s?\s+ago\b/i)
  if (!m) return null
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : WORD_NUMBERS[m[1].toLowerCase()] ?? 1
  const unit = m[2].toLowerCase()
  const days = unit === 'minute' || unit === 'hour' ? 0 : unit === 'day' ? n : unit === 'week' ? n * 7 : n * 30
  return daysToBucket(days)
}

/** Parses a stored date/timestamp as a local calendar date (avoids UTC-midnight day shifts). */
export function localDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function daysSince(iso: string, now = new Date()): number {
  const start = localDate(iso)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((today.getTime() - start.getTime()) / 86_400_000)
}

type TrackerApp = {
  status: string
  applied_at: string | null
  first_response_at: string | null
  response_type: string | null
  source: string | null
  posting_age: string | null
}

export type Nudge = 'follow_up' | 'stale' | null

/** Day-5 "Follow up?" and day-10 "No reply" nudges for applications still waiting on a reply. */
export function applicationNudge(app: TrackerApp, now = new Date()): Nudge {
  if (app.status !== 'applied' || !app.applied_at || app.first_response_at) return null
  const days = daysSince(app.applied_at, now)
  if (days >= 10) return 'stale'
  if (days >= 5) return 'follow_up'
  return null
}

// A reply is any first response that wasn't an automated rejection.
export function isReply(app: TrackerApp): boolean {
  return !!app.first_response_at && app.response_type !== 'auto_reject'
}

export type PatternRow = { label: string; replies: number; total: number }
export type Patterns = { eligible: number; bySource: PatternRow[]; byPostingAge: PatternRow[]; byWeekday: PatternRow[] }

export const PATTERNS_MIN_APPS = 10
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function group(apps: TrackerApp[], keyOf: (a: TrackerApp) => string | null, order: string[], minTotal = 1): PatternRow[] {
  const rows = new Map<string, PatternRow>()
  for (const a of apps) {
    const k = keyOf(a)
    if (!k) continue
    const row = rows.get(k) ?? { label: k, replies: 0, total: 0 }
    row.total += 1
    if (isReply(a)) row.replies += 1
    rows.set(k, row)
  }
  return order.map(k => rows.get(k)).filter((r): r is PatternRow => !!r && r.total >= minTotal)
}

/**
 * Personal reply-rate breakdowns. Only applications applied 10+ days ago count (younger ones
 * haven't had a fair chance to get a reply). Returns null below PATTERNS_MIN_APPS.
 */
export function computePatterns(apps: TrackerApp[], now = new Date()): Patterns | null {
  const eligible = apps.filter(a => a.applied_at && daysSince(a.applied_at, now) >= 10)
  if (eligible.length < PATTERNS_MIN_APPS) return null
  return {
    eligible: eligible.length,
    bySource: group(eligible, a => (a.source ? sourceLabel(a.source) : null), APPLICATION_SOURCES.map(s => s.label)),
    byPostingAge: group(eligible, a => (a.posting_age ? postingAgeLabel(a.posting_age) : null), POSTING_AGES.map(s => s.label), 3),
    byWeekday: group(eligible, a => WEEKDAYS[localDate(a.applied_at!).getDay()], WEEKDAYS),
  }
}

/**
 * Validates the optional tracker-signal fields from a request body. Only keys present in the
 * body are returned, so PATCH can leave untouched fields alone. Throws on an invalid value.
 */
export function parseSignalFields(body: Record<string, unknown>): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  const check = (key: string, ok: (v: unknown) => boolean) => {
    if (body[key] === undefined) return
    const v = body[key] === '' ? null : body[key]
    if (v !== null && !ok(v)) throw Object.assign(new Error(`Invalid ${key}`), { name: 'ValidationError' })
    out[key] = v as string | null
  }
  check('source', isApplicationSource)
  check('posting_age', isPostingAge)
  check('response_type', isResponseType)
  check('first_response_at', v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)))
  return out
}
