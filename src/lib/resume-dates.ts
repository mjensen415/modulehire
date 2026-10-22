// Dates and employer names as they appear on a generated resume. Stored dates are messy:
// "2018-01-01", "2011-01", "2016", "Jan 2020", "present-01", "Present", "Unknown", null.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export type ParsedDate = { year: number; month: number | null } // month 0-11

export function isPresentDate(raw: unknown): boolean {
  return typeof raw === 'string' && /^\s*(present|current|now)/i.test(raw)
}

export function parseResumeDate(raw: unknown): ParsedDate | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim().toLowerCase()
  if (!s || isPresentDate(s)) return null
  let m = s.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?/)
  if (m) {
    const month = parseInt(m[2], 10) - 1
    return { year: parseInt(m[1], 10), month: month >= 0 && month < 12 ? month : null }
  }
  m = s.match(/^(\d{1,2})\/(\d{4})$/)
  if (m) {
    const month = parseInt(m[1], 10) - 1
    return { year: parseInt(m[2], 10), month: month >= 0 && month < 12 ? month : null }
  }
  m = s.match(/^([a-z]{3,9})\.?\s+(\d{4})$/)
  if (m) {
    const month = MONTHS.findIndex(name => m![1].startsWith(name.toLowerCase()))
    return month >= 0 ? { year: parseInt(m[2], 10), month } : null
  }
  m = s.match(/^(\d{4})$/)
  if (m) return { year: parseInt(m[1], 10), month: null }
  return null
}

// "Mon YYYY" when a month exists, "YYYY" when it doesn't, "" when unparseable. Never "Unknown".
export function formatResumeDate(raw: unknown): string {
  const d = parseResumeDate(raw)
  if (!d) return ''
  return d.month === null ? String(d.year) : `${MONTHS[d.month]} ${d.year}`
}

// "Jan 2020 to Present", "2016 to 2019", "" when undated. An open end only reads as Present
// when the role has a start; a role with no dates at all is undated, not current.
export function formatResumeRange(start: unknown, end: unknown): string {
  const s = formatResumeDate(start)
  const e = formatResumeDate(end)
  if (s && e) return s === e ? s : `${s} to ${e}`
  if (s) return `${s} to Present`
  return e
}

type Range = { start: ParsedDate | null; end: ParsedDate | null; current: boolean }

function toRange(start: unknown, end: unknown): Range {
  const s = parseResumeDate(start)
  const e = parseResumeDate(end)
  const current = isPresentDate(end) || (!e && !!s)
  return { start: s, end: current ? null : e, current }
}

function key(d: ParsedDate | null): number {
  return d ? d.year * 12 + (d.month ?? 0) : -1
}

/**
 * Reverse-chronological order: current roles first (newest start first), then ended roles by
 * end date (ties broken by start date), undated roles last.
 */
export function compareResumeRanges(aStart: unknown, aEnd: unknown, bStart: unknown, bEnd: unknown): number {
  const a = toRange(aStart, aEnd)
  const b = toRange(bStart, bEnd)
  const aUndated = !a.start && !a.end
  const bUndated = !b.start && !b.end
  if (aUndated !== bUndated) return aUndated ? 1 : -1
  if (a.current !== b.current) return a.current ? -1 : 1
  if (!a.current) {
    const byEnd = key(b.end) - key(a.end)
    if (byEnd !== 0) return byEnd
  }
  return key(b.start) - key(a.start)
}

// Split a formatted range ("Jan 2020 to Present", or a legacy "2018 – 2021") into [start, end].
export function splitResumeRange(dates: string): [string, string] {
  const parts = (dates ?? '').split(/\s+to\s+|\s*[–—]\s*|\s+-\s+/i)
  return [(parts[0] ?? '').trim(), (parts[1] ?? '').trim()]
}

const COMPANY_SUFFIXES = /\b(inc|incorporated|ltd|limited|llc|llp|plc|gmbh|corp|corporation|co|company|international|intl|group|holdings)\b/g

// "Fiverr International Ltd." and "fiverr" → "fiverr"; "33 Crickets" and "33Crickets" → "33crickets".
export function normalizeCompany(name: unknown): string {
  if (typeof name !== 'string') return ''
  const base = name.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9\s]/g, ' ')
  const stripped = base.replace(COMPANY_SUFFIXES, ' ').replace(/\s+/g, '')
  return stripped || base.replace(/\s+/g, '')
}
