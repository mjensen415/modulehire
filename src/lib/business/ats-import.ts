// Pure (client-safe) helpers for importing a candidate export from an ATS: column presets,
// automatic column mapping, row → candidate, and matching resume files to candidates.
// Column names differ by ATS, account and export settings, so presets only order the guesses;
// the wizard always shows the mapping and lets the user change it.

export type AtsKey = 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'adp' | 'other'
export type FieldKey = 'fullName' | 'firstName' | 'lastName' | 'email' | 'resumeText' | 'resumeFile' | 'externalId' | 'stage'

export const FIELD_LABELS: Record<FieldKey, string> = {
  fullName: 'Full name',
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Email',
  resumeText: 'Resume text',
  resumeFile: 'Resume file name',
  externalId: 'Candidate ID',
  stage: 'Stage',
}

const BASE: Record<FieldKey, string[]> = {
  fullName: ['name', 'full name', 'candidate', 'candidate name', 'applicant', 'applicant name', 'contact name'],
  firstName: ['first name', 'firstname', 'given name', 'candidate first name', 'legal first name'],
  lastName: ['last name', 'lastname', 'surname', 'family name', 'candidate last name', 'legal last name'],
  email: ['email', 'email address', 'e mail', 'candidate email', 'primary email', 'personal email', 'emails', 'contact email', 'email addresses'],
  resumeText: ['resume text', 'resume content', 'cv text', 'plain text resume', 'resume body'],
  resumeFile: ['resume filename', 'resume file name', 'resume file', 'resume', 'cv', 'attachment', 'resume attachment', 'resume url', 'resume link'],
  externalId: ['candidate id', 'application id', 'applicant id', 'person id', 'profile id', 'opportunity id', 'id'],
  stage: ['stage', 'current stage', 'pipeline stage', 'application stage', 'status', 'application status', 'step'],
}

export const ATS_PRESETS: Record<AtsKey, { label: string; prefer: Partial<Record<FieldKey, string[]>> }> = {
  greenhouse: { label: 'Greenhouse', prefer: { externalId: ['candidate id', 'application id'], stage: ['current stage', 'stage'] } },
  lever: { label: 'Lever', prefer: { externalId: ['opportunity id', 'contact id', 'candidate id'], stage: ['stage', 'current stage'] } },
  ashby: { label: 'Ashby', prefer: { externalId: ['candidate id', 'application id'], stage: ['current interview stage', 'stage'] } },
  workable: { label: 'Workable', prefer: { externalId: ['candidate id', 'id'], stage: ['stage', 'disqualified'] } },
  adp: { label: 'ADP', prefer: { externalId: ['applicant id', 'candidate id', 'associate id'], stage: ['status', 'application status'] } },
  other: { label: 'Another ATS or a spreadsheet', prefer: {} },
}

export const ATS_KEYS = Object.keys(ATS_PRESETS) as AtsKey[]

export const normalizeHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export type Mapping = Partial<Record<FieldKey, string>>

/** Best guess for each field: exact alias match first, then a header that contains the alias. */
export function autoMap(headers: string[], ats: AtsKey): Mapping {
  const norm = headers.map(normalizeHeader)
  const used = new Set<number>()
  const mapping: Mapping = {}
  const order: FieldKey[] = ['email', 'externalId', 'firstName', 'lastName', 'fullName', 'resumeText', 'resumeFile', 'stage']
  for (const field of order) {
    const aliases = [...(ATS_PRESETS[ats].prefer[field] ?? []), ...BASE[field]]
    let idx = -1
    for (const a of aliases) {
      idx = norm.findIndex((h, i) => !used.has(i) && h === a)
      if (idx !== -1) break
    }
    if (idx === -1 && field !== 'externalId' && field !== 'fullName') {
      // Loose match ("Candidate Email (personal)"), skipped for short ambiguous fields.
      for (const a of aliases) {
        if (a.length < 4) continue
        idx = norm.findIndex((h, i) => !used.has(i) && h.includes(a))
        if (idx !== -1) break
      }
    }
    if (idx !== -1) {
      mapping[field] = headers[idx]
      used.add(idx)
    }
  }
  // A full name column makes first/last redundant, and vice versa; keep both if present.
  return mapping
}

export type CandidateRow = {
  rowNum: number // 1-based spreadsheet row (header is row 1)
  name: string | null
  email: string | null
  resumeText: string | null
  resumeFileHint: string | null
  externalId: string | null
  stage: string | null
}

const cell = (row: Record<string, unknown>, col?: string) => {
  if (!col) return null
  const v = row[col]
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s || null
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i

export function rowsToCandidates(rows: Array<Record<string, unknown>>, mapping: Mapping): CandidateRow[] {
  return rows
    .map((row, i) => {
      const first = cell(row, mapping.firstName)
      const last = cell(row, mapping.lastName)
      const full = cell(row, mapping.fullName)
      const name = full ?? ([first, last].filter(Boolean).join(' ') || null)
      const emailRaw = cell(row, mapping.email)
      const email = emailRaw?.match(EMAIL_RE)?.[0]?.toLowerCase() ?? null
      let resumeText = cell(row, mapping.resumeText)
      let resumeFileHint = cell(row, mapping.resumeFile)
      // A "resume" column holding a short value or a link is a file reference, not resume text.
      if (resumeText && (resumeText.length < 200 || /^https?:\/\//i.test(resumeText))) {
        resumeFileHint = resumeFileHint ?? resumeText
        resumeText = null
      }
      // And the reverse: a "Resume" column that holds the whole resume.
      if (!resumeText && resumeFileHint && resumeFileHint.length >= 200 && !/^https?:\/\//i.test(resumeFileHint)) {
        resumeText = resumeFileHint
        resumeFileHint = null
      }
      return {
        rowNum: i + 2,
        name,
        email,
        resumeText,
        resumeFileHint,
        externalId: cell(row, mapping.externalId),
        stage: cell(row, mapping.stage),
      }
    })
    .filter((c) => c.name || c.email || c.resumeText || c.externalId)
}

const RESUME_EXT = /\.(pdf|docx|txt)$/i
export const isResumeFileName = (n: string) => RESUME_EXT.test(n) && !n.split('/').pop()!.startsWith('.') && !n.includes('__MACOSX/')

const baseName = (p: string) => decodeURIComponent(p.split(/[?#]/)[0]).split('/').pop()!.toLowerCase()
const tokens = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(Boolean)

/**
 * Pairs each candidate with at most one resume file, and each file with at most one candidate.
 * In order of confidence: the file named in the resume column, the candidate id in the file name,
 * the email in the file name, then first and last name both in the file name. A file that fits
 * more than one candidate at the same level is left for a stronger signal or left unmatched.
 */
export function matchResumes(candidates: CandidateRow[], fileNames: string[]): Map<number, number> {
  const result = new Map<number, number>() // candidate index -> file index
  const takenFiles = new Set<number>()
  const files = fileNames.map((f, i) => ({ i, base: baseName(f), toks: new Set(tokens(baseName(f).replace(RESUME_EXT, ''))) }))

  const pass = (score: (c: CandidateRow, f: (typeof files)[number]) => boolean) => {
    const hits = new Map<number, number[]>() // file -> candidates
    candidates.forEach((c, ci) => {
      if (result.has(ci)) return
      for (const f of files) {
        if (takenFiles.has(f.i)) continue
        if (score(c, f)) hits.set(f.i, [...(hits.get(f.i) ?? []), ci])
      }
    })
    const perCandidate = new Map<number, number[]>()
    for (const [fi, cis] of hits) for (const ci of cis) perCandidate.set(ci, [...(perCandidate.get(ci) ?? []), fi])
    for (const [fi, cis] of hits) {
      if (cis.length !== 1) continue
      const ci = cis[0]
      if ((perCandidate.get(ci) ?? []).length !== 1 || result.has(ci)) continue
      result.set(ci, fi)
      takenFiles.add(fi)
    }
  }

  pass((c, f) => !!c.resumeFileHint && baseName(c.resumeFileHint) === f.base)
  pass((c, f) => !!c.externalId && c.externalId.length >= 3 && f.toks.has(c.externalId.toLowerCase()))
  pass((c, f) => {
    if (!c.email) return false
    const local = c.email.split('@')[0]
    return f.base.includes(c.email) || (local.length >= 4 && tokens(local).every((t) => f.toks.has(t)) && tokens(local).length > 0)
  })
  pass((c, f) => {
    const t = tokens(c.name ?? '')
    if (t.length < 2) return false
    return f.toks.has(t[0]) && f.toks.has(t[t.length - 1])
  })
  return result
}
