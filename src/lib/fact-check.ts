// Deterministic guard against AI text that claims more than the candidate's modules say.
// Two checks, both against the source text the AI was given:
//   - every number (including %, $, x, K, M) must appear in the source
//   - every proper noun / tool name (a capitalized word that isn't starting a sentence, an
//     acronym, or a mixed-case name like iOS) must appear in the source or the allowed context
// It is deliberately literal: a false positive costs a plainer bullet, a false negative puts a
// fabricated claim on someone's resume.

export type FactFlag = {
  module_id: string | null
  bullet: string
  reason: string
  replacement: string | null
}

export type SourceModule = { id: string; title: string; content: string }

// Capitalized words that are not claims.
const ALWAYS_OK = new Set([
  'i', 'present', 'current',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'q1', 'q2', 'q3', 'q4',
])

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/(\d),(?=\d{3}\b)/g, '$1') // 1,200 -> 1200
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// "$2.5M", "40%", "3x", "1,200+", "12" → "2.5", "40", "3", "1200", "12"
const NUMBER_RE = /\$?\s?\d+(?:[.,]\d+)*(?:\s?(?:%|percent|x|k|m|mm|b|bn)(?![a-z]))?\+?/gi

function numbersIn(text: string): { raw: string; core: string }[] {
  const out: { raw: string; core: string }[] = []
  for (const match of text.matchAll(NUMBER_RE)) {
    const raw = match[0].trim()
    const core = raw.replace(/[^\d.,]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(/[.,]$/, '')
    if (core) out.push({ raw, core })
  }
  return out
}

function hasNumber(source: string, core: string): boolean {
  return new RegExp(`(?<![\\d.])${escapeRe(core)}(?![\\d])`).test(source)
}

// Candidate proper nouns: skip the first word of each sentence (bullets open with a
// capitalized verb), then keep acronyms, mixed-case names, and capitalized words.
function properNounsIn(text: string): string[] {
  const out: string[] = []
  const sentences = text.split(/(?<=[.!?:;])\s+|\n+|\s+[–—-]\s+/)
  for (const sentence of sentences) {
    const words = sentence.trim().replace(/^[•\-*▪◦·–—\s]+/, '').split(/\s+/)
    words.forEach((w, i) => {
      const word = w.replace(/^[("'“‘[]+|[)"'”’\].,!?:;]+$/g, '').replace(/'s$/i, '')
      if (word.length < 2 || !/[a-z]/i.test(word)) return
      const isAcronym = /^[A-Z0-9&+#./-]{2,}$/.test(word) && /[A-Z]/.test(word)
      const isMixed = /[a-z][A-Z]/.test(word)
      const isCapitalized = /^[A-Z]/.test(word)
      if (i === 0 && !isAcronym && !isMixed) return
      if (!isAcronym && !isMixed && !isCapitalized) return
      if (ALWAYS_OK.has(word.toLowerCase())) return
      out.push(word)
    })
  }
  return out
}

function hasTerm(source: string, word: string): boolean {
  const w = word.toLowerCase()
  const variants = new Set([w, w.replace(/s$/, ''), w.replace(/es$/, ''), w.replace(/-/g, ' '), w.replace(/-/g, '')])
  for (const v of variants) {
    if (v.length < 2) continue
    if (new RegExp(`(?<![a-z0-9])${escapeRe(v)}`).test(source)) return true
  }
  return false
}

/**
 * Reasons `text` claims something the sources don't support; empty when it's clean.
 * `sources` is what the AI was given about this claim (module content, title); `context` is
 * extra text proper nouns may come from (company, title, the candidate's own profile).
 */
export function unsupportedClaims(text: string, sources: string[], context: string[] = []): string[] {
  const source = normalize(sources.join('\n'))
  const nameSource = normalize([...sources, ...context].join('\n'))
  const reasons: string[] = []
  for (const n of numbersIn(text)) {
    if (!hasNumber(source, n.core)) reasons.push(`number "${n.raw}" is not in the module`)
  }
  for (const word of properNounsIn(text)) {
    if (!hasTerm(nameSource, word)) reasons.push(`"${word}" is not in the module`)
  }
  return Array.from(new Set(reasons))
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.trim().replace(/^[•\-*▪◦·–—\d.)\s]+/, '').trim())
    .filter(s => s.length >= 15)
}

// A plain sentence straight from the module, capped at ~30 words.
function plainSentence(sentence: string): string {
  const words = sentence.split(/\s+/)
  const capped = words.length > 30 ? words.slice(0, 30).join(' ').replace(/[,;:]$/, '') + '.' : sentence
  return capped.charAt(0).toUpperCase() + capped.slice(1)
}

function overlap(a: string, b: string): number {
  const wa = new Set(normalize(a).split(/\W+/).filter(w => w.length > 3))
  const wb = normalize(b).split(/\W+/).filter(w => w.length > 3)
  return wb.filter(w => wa.has(w)).length
}

function repeatsAny(sentence: string, others: string[]): boolean {
  const words = normalize(sentence).split(/\W+/).filter(w => w.length > 3).length
  return words > 0 && others.some(o => overlap(o, sentence) / words >= 0.6)
}

/**
 * Fact-checks one experience entry's bullets against the modules it was built from.
 * `sourceIds[i]` names the module bullet i came from when the model said so; otherwise the
 * closest module by word overlap is used. A failing bullet is replaced by the next unused
 * sentence of its module (no JD phrasing), or dropped when the module has none left.
 */
export function factCheckBullets(
  bullets: string[],
  modules: SourceModule[],
  context: string[],
  sourceIds: (string | null | undefined)[] = [],
): { bullets: string[]; flags: FactFlag[] } {
  const flags: FactFlag[] = []
  const used = new Map<string, number>()
  const out: string[] = []
  bullets.forEach((bullet, i) => {
    if (typeof bullet !== 'string' || !bullet.trim()) return
    const named = modules.find(m => m.id === sourceIds[i])
    const source = named ?? [...modules].sort((a, b) => overlap(b.content, bullet) - overlap(a.content, bullet))[0]
    const reasons = source
      ? unsupportedClaims(bullet, [source.content, source.title], context)
      : unsupportedClaims(bullet, modules.map(m => m.content), context)
    if (reasons.length === 0) { out.push(bullet); return }

    let replacement: string | null = null
    if (source) {
      // Next unused sentence that doesn't repeat a bullet already on the resume.
      const sentences = splitSentences(source.content)
      let next = used.get(source.id) ?? 0
      while (next < sentences.length && repeatsAny(sentences[next], [...out, ...bullets])) next++
      if (next < sentences.length) replacement = plainSentence(sentences[next])
      used.set(source.id, next + 1)
    }
    if (replacement) out.push(replacement)
    flags.push({ module_id: source?.id ?? null, bullet, reason: reasons.join('; '), replacement })
  })
  return { bullets: out, flags }
}

/**
 * Drops the sentences of a free-text rewrite (summary, module rewrite, theme suggestion) that
 * claim something the sources don't. Returns the cleaned text and what was removed.
 */
export function stripUnsupportedSentences(
  text: string,
  sources: string[],
  context: string[] = [],
): { text: string; removed: { sentence: string; reason: string }[] } {
  const removed: { sentence: string; reason: string }[] = []
  const lines = text.split('\n')
  const keptLines = lines.map(line => {
    const sentences = line.split(/(?<=[.!?])\s+/)
    const kept = sentences.filter(sentence => {
      if (!sentence.trim()) return true
      const reasons = unsupportedClaims(sentence, sources, context)
      if (reasons.length === 0) return true
      removed.push({ sentence: sentence.trim(), reason: reasons.join('; ') })
      return false
    })
    return kept.join(' ')
  })
  return { text: keptLines.filter((l, i) => l.trim() || !lines[i].trim()).join('\n').trim(), removed }
}
