// Client-side fit preview for the resume editor: scores the document text against a JD's
// extracted criteria on every keystroke, with no server round trip. The stored number is the
// server's (POST /api/resume-docs/[id]/fit, same prompt as the match report); this is a preview
// on the same 0-100 scale, calibrated against it (see CALIBRATION below).
import type { JdCriterion } from './dimensions'

const STOPWORDS = new Set([
  'a', 'an', 'and', 'or', 'the', 'of', 'to', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'that', 'this',
  'be', 'is', 'are', 'was', 'were', 'will', 'can', 'has', 'have', 'had', 'not', 'but', 'it', 'its', 'you', 'your', 'our',
  'their', 'they', 'them', 'who', 'how', 'what', 'when', 'where', 'which', 'across', 'within', 'strong', 'proven', 'deep',
  'experience', 'ability', 'skills', 'skill', 'track', 'record', 'years', 'year', 'plus', 'etc', 'related', 'relevant',
])

// Light suffix stripping, enough that "onboarding"/"onboarded", "programs"/"program" and
// "managing"/"management" meet.
export function stem(word: string): string {
  let w = word.toLowerCase()
  if (w.length <= 4) return w
  for (const suffix of ['ations', 'ation', 'ments', 'ment', 'ings', 'ing', 'ities', 'ity', 'ies', 'ers', 'er', 'ed', 'es', 's']) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 3) {
      w = w.slice(0, -suffix.length)
      if (suffix === 'ies') w += 'y'
      break
    }
  }
  return w
}

function normalize(text: string): string {
  return ` ${text.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9+#%]+/g, ' ').trim()} `
}

function words(text: string): string[] {
  return normalize(text).trim().split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.has(w))
}

export type LiveFitCriterion = {
  label: string
  weight: number
  covered: boolean
  /** 0-1 raw coverage: 1 when the label or one of the posting's phrasings appears verbatim,
   *  else the best share of any phrasing's words present (stemmed). */
  coverage: number
  /** What matched, for the chip tooltip. */
  matched: string | null
}

export type LiveFit = { score: number; criteria: LiveFitCriterion[] }

// Raw weighted coverage (0-1) → the server's 0-100 scale. Fit by least squares on 10 resume
// documents (built from real library modules, 2 JDs, 3-16 modules each) scored by the server
// fit: leave-one-out mean error 5.7 points, worst 15. The server itself moves a few points
// between runs on identical text, which is why the editor eases to the server number after
// 10s idle instead of trusting this alone.
const CALIBRATION = { intercept: 22.5, slope: 65.6 }

export function scoreLiveFit(text: string, criteria: JdCriterion[]): LiveFit {
  if (criteria.length === 0) return { score: 0, criteria: [] }
  const norm = normalize(text)
  const stems = new Set(words(text).map(stem))

  const out = criteria.map((c): LiveFitCriterion => {
    const phrasings = [c.label, ...(c.also_called ?? [])].filter(Boolean)
    const phraseHit = phrasings.find(p => {
      const n = normalize(p).trim()
      return n.length > 2 && norm.includes(` ${n} `)
    })
    // Best partial match across the label and every phrasing: "QBR leadership" may not appear,
    // but "quarterly business reviews" words might.
    let share = 0
    let present: string[] = []
    for (const p of phrasings) {
      const pStems = Array.from(new Set(words(p).map(stem)))
      if (pStems.length === 0) continue
      const hit = pStems.filter(s => stems.has(s))
      if (hit.length / pStems.length > share) { share = hit.length / pStems.length; present = hit }
    }
    const coverage = phraseHit ? 1 : share
    return {
      label: c.label,
      weight: c.weight,
      covered: !!phraseHit || share >= 0.6,
      coverage,
      matched: phraseHit ?? (present.length > 0 ? present.join(', ') : null),
    }
  })

  const weightSum = out.reduce((sum, c) => sum + c.weight, 0) || 1
  const raw = out.reduce((sum, c) => sum + c.weight * c.coverage, 0) / weightSum
  const score = Math.max(0, Math.min(100, Math.round(CALIBRATION.intercept + CALIBRATION.slope * raw)))
  return { score, criteria: out }
}

/** How many of the posting's key phrases appear in the text (exactly, or most of their words). */
export function phraseCoverage(text: string, phrases: string[]): { found: string[]; missing: string[] } {
  const norm = normalize(text)
  const stems = new Set(words(text).map(stem))
  const found: string[] = []
  const missing: string[] = []
  for (const p of phrases) {
    const n = normalize(p).trim()
    const pStems = Array.from(new Set(words(p).map(stem)))
    const hit = (n.length > 1 && norm.includes(` ${n} `)) || (pStems.length > 0 && pStems.filter(s => stems.has(s)).length / pStems.length >= 0.6)
    ;(hit ? found : missing).push(p)
  }
  return { found, missing }
}
