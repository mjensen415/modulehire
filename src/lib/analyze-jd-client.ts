// Client-side helpers for /api/analyze-jd and /api/fetch-jd-url.
//
// /api/analyze-jd streams NDJSON (one JSON object per line: basics, criteria, done/error).
// Calling `res.json()` on it throws "Unexpected non-whitespace character after JSON",
// so callers that just want the final result should use analyzeJd() instead.

export type JdCriterionLite = { label: string; dimension: string; weight: number; description?: string }

export type AnalyzedJd = {
  jd_id: string
  extracted_company: string | null
  extracted_job_title: string | null
  extracted_role_type: string | null
  extracted_seniority: string | null
  extracted_themes: string[]
  extracted_phrases: string[]
  extracted_criteria: JdCriterionLite[]
}

export async function analyzeJd(rawText: string): Promise<AnalyzedJd> {
  const res = await fetch('/api/analyze-jd', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw_text: rawText }),
  })

  // Errors before the stream starts (401, 400, 429) come back as plain JSON.
  if (!res.ok || !res.body) {
    let message = 'Could not read this job description. Try again in a moment.'
    try {
      const data = await res.json()
      if (data?.error) message = data.error
    } catch { /* not JSON — keep the default message */ }
    throw new Error(message)
  }

  const result: Partial<AnalyzedJd> = { extracted_criteria: [] }
  let basicsFailed = false

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  const handle = (line: string) => {
    if (!line.trim()) return
    let obj: Record<string, unknown>
    try { obj = JSON.parse(line) } catch { return }
    if (obj.type === 'basics') {
      const { type: _type, ...fields } = obj
      void _type
      Object.assign(result, fields)
    } else if (obj.type === 'criteria') {
      result.extracted_criteria = (obj.extracted_criteria as JdCriterionLite[]) ?? []
    } else if (obj.type === 'error' && obj.stage === 'basics') {
      basicsFailed = true
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buf.indexOf('\n')) >= 0) {
      handle(buf.slice(0, idx))
      buf = buf.slice(idx + 1)
    }
  }
  handle(buf)

  if (basicsFailed || !result.jd_id) {
    throw new Error('Could not read this job description. Try again in a moment.')
  }

  return {
    jd_id: result.jd_id,
    extracted_company: result.extracted_company ?? null,
    extracted_job_title: result.extracted_job_title ?? null,
    extracted_role_type: result.extracted_role_type ?? null,
    extracted_seniority: result.extracted_seniority ?? null,
    extracted_themes: result.extracted_themes ?? [],
    extracted_phrases: result.extracted_phrases ?? [],
    extracted_criteria: result.extracted_criteria ?? [],
  }
}

/** True when the whole input is a single http(s) URL (what people paste from a job board). */
export function looksLikeUrl(text: string): boolean {
  const t = text.trim()
  if (!/^https?:\/\/\S+$/i.test(t)) return false
  try { new URL(t); return true } catch { return false }
}

/** Fetch a job posting page and return its readable text. Throws with a user-facing message. */
export async function fetchJdFromUrl(url: string): Promise<string> {
  const res = await fetch('/api/fetch-jd-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: url.trim() }),
  })
  let data: { text?: string; error?: string } = {}
  try { data = await res.json() } catch { /* fall through */ }
  if (!res.ok || !data.text) {
    throw new Error(
      (data.error ? `${data.error} ` : "We couldn't read that link. ") +
      'Some job sites block this — copy the description text and paste it instead.'
    )
  }
  return data.text
}
