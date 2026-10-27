// Local, AI-free first pass for module matching. Scores every module against the JD by
// weighted term overlap so only a short list goes to the (slower) AI re-score. Deterministic
// and fast: a 200-module library scores in a few milliseconds.

const STOP = new Set(('a an and are as at be by for from has have in into is it its of on or that the their this to was were will with you your our we they them who what when where how all any can may more most other some such than then there these those through using across within about over per via not no only own same so too very just also experience team teams work working role roles job ability strong including include includes skills skill years year plus etc').split(' '))

function stem(w: string): string {
  return w.replace(/(ing|ings|ed|es|s|ly|ment|ments|tion|tions)$/,'')
}

export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9+#.-]*/g) ?? [])
    .map(w => w.replace(/[.-]+$/, ''))
    .filter(w => w.length > 2 && !STOP.has(w))
    .map(stem)
}

type Criterion = { label?: string; weight?: number; description?: string; also_called?: string[]; dimension?: string }
type JdLike = {
  extracted_job_title?: string | null
  extracted_themes?: string[] | null
  extracted_phrases?: string[] | null
  extracted_criteria?: unknown
}
type ModuleLike = { id: string; title?: string | null; themes?: string[] | null; content?: string | null; dimensions?: string[] | null }

export function shortlistScores<M extends ModuleLike>(jd: JdLike, modules: M[]): Map<string, number> {
  // Build weighted JD terms. Criteria carry their own 1-5 weight; themes and phrases count 2.
  const termWeight = new Map<string, number>()
  const phrases: Array<{ text: string; w: number }> = []
  const dimWeight = new Map<string, number>()
  const add = (text: string | undefined | null, w: number, asPhrase = false) => {
    if (!text) return
    for (const t of new Set(tokens(text))) termWeight.set(t, Math.max(termWeight.get(t) ?? 0, w))
    if (asPhrase && text.trim().split(/\s+/).length > 1) phrases.push({ text: text.toLowerCase(), w })
  }
  const criteria: Criterion[] = Array.isArray(jd.extracted_criteria) ? jd.extracted_criteria as Criterion[] : []
  for (const c of criteria) {
    const w = Math.min(5, Math.max(1, Number(c.weight) || 3))
    add(c.label, w, true)
    for (const p of c.also_called ?? []) add(p, w, true)
    add(c.description, Math.max(1, w - 2))
    if (c.dimension) dimWeight.set(c.dimension, Math.max(dimWeight.get(c.dimension) ?? 0, w))
  }
  for (const t of jd.extracted_themes ?? []) add(t, 2, true)
  for (const p of jd.extracted_phrases ?? []) add(p, 2, true)
  add(jd.extracted_job_title, 2)

  const raw = new Map<string, number>()
  for (const m of modules) {
    const body = `${m.title ?? ''} ${(m.themes ?? []).join(' ')} ${m.content ?? ''}`
    const mt = new Set(tokens(body))
    let s = 0
    for (const [t, w] of termWeight) if (mt.has(t)) s += w
    const lower = body.toLowerCase()
    for (const p of phrases) if (lower.includes(p.text)) s += p.w * 2
    for (const d of m.dimensions ?? []) s += (dimWeight.get(d) ?? 0) * 0.5
    raw.set(m.id, s)
  }
  // Normalize: the best module lands near 90, everything else proportionally below.
  const max = Math.max(1, ...raw.values())
  const out = new Map<string, number>()
  for (const [id, s] of raw) out.set(id, Math.round((s / max) * 90))
  return out
}
