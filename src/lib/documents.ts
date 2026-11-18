export const DOCUMENT_KINDS = ['resume', 'performance_review', 'brag_doc', 'interview_email', 'generated_resume', 'other'] as const
export type DocumentKind = typeof DOCUMENT_KINDS[number]

/** What the user can pick on /upload besides a resume. */
export const IMPORT_KINDS = ['performance_review', 'brag_doc', 'other'] as const
export type ImportKind = typeof IMPORT_KINDS[number]

export const KIND_LABELS: Record<DocumentKind, string> = {
  resume: 'Resume',
  performance_review: 'Performance review',
  brag_doc: 'Brag doc',
  interview_email: 'Interview email',
  generated_resume: 'Tailored resume',
  other: 'Other',
}

export function isImportKind(v: unknown): v is ImportKind {
  return typeof v === 'string' && (IMPORT_KINDS as readonly string[]).includes(v)
}

// ─── Review period → job ──────────────────────────────────────────────────────
// "2025 annual review.pdf", "Mid-year review, H1 2026" → a year and a label. The year picks the
// job whose dates contain it; the user confirms the job before anything is inserted.

export type PeriodGuess = { year: number | null; label: string | null }

export function guessPeriod(filename: string | null, text: string): PeriodGuess {
  const name = (filename ?? '').replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ')
  const head = text.slice(0, 1500)
  const yearsIn = (s: string) => [...s.matchAll(/\b(19[89]\d|20[0-4]\d)\b/g)].map(m => Number(m[1]))
  const fromName = yearsIn(name)
  // In the text, a year next to "review" / "period" / "fiscal" beats one in "Goals for 2026".
  const near = [...head.matchAll(/(?:review|period|fiscal|fy)\D{0,40}?\b(19[89]\d|20[0-4]\d)\b|\b(19[89]\d|20[0-4]\d)\b\D{0,40}?(?:review|period)/gi)]
    .map(m => Number(m[1] ?? m[2]))
  const fromText = yearsIn(head)
  const year = fromName.length ? Math.max(...fromName)
    : near.length ? near[0]
    : fromText.length ? Math.min(...fromText)
    : null
  const source = `${name} ${head}`.toLowerCase()
  const kind = /mid[\s-]?year|h1\b/.test(source) ? 'mid-year review'
    : /\bq[1-4]\b|quarterly/.test(source) ? 'quarterly review'
    : /annual|year[\s-]?end|yearly/.test(source) ? 'annual review'
    : 'review'
  return { year, label: year ? `${year} ${kind}` : null }
}

type JobRow = { id: string; company: string; title: string | null; start_date: string | null; end_date: string | null }

/** The job whose dates contain the year (most recent start wins); null if none does. */
export function jobForYear(jobs: JobRow[], year: number | null): string | null {
  if (!year) return null
  const y = (d: string | null) => (d ? Number(String(d).slice(0, 4)) : null)
  const containing = jobs.filter(j => {
    const start = y(j.start_date)
    const end = y(j.end_date) ?? new Date().getUTCFullYear()
    return start !== null && start <= year && year <= end
  })
  containing.sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)))
  return containing[0]?.id ?? null
}

// Limits live in src/lib/entitlements.ts.
