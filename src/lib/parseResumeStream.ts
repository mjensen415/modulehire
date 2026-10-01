// NDJSON reader for POST /api/parse-resume — mirrors src/lib/dimensions.ts's Dimension type
// shape in the `dimensions` field each role_done module carries.
export type ParseStreamRole = { index: number; company: string; title: string | null; date_start: string | null; date_end: string | null }
export type ParseStreamModule = { id: string; title: string; type: string; dimensions: string[] }

export type ParseStreamEvent =
  | { type: 'outline'; roles: ParseStreamRole[]; extras: boolean }
  | { type: 'role_done'; index: number; company: string; title: string | null; modules: ParseStreamModule[] }
  | { type: 'role_failed'; index: number; company: string; title: string | null }
  | { type: 'contact'; name: string | null }
  | {
      type: 'done'
      module_count: number
      modules: unknown[]
      contact: Record<string, unknown> | null
      resume_id: string
      profile_updated?: boolean
      job_experience_ids?: string[]
      job_sync_error?: string
    }
  | { type: 'error' }

/** Reads /api/parse-resume's NDJSON stream, calling onEvent once per line as it arrives. */
export async function streamParseResume(
  resumeId: string,
  rawText: string,
  onEvent: (event: ParseStreamEvent) => void
): Promise<void> {
  const res = await fetch('/api/parse-resume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resume_id: resumeId, raw_text: rawText }),
  })

  if (!res.ok || !res.body) {
    if (res.status === 504) throw new Error('AI parse timed out — model took too long. Try again or paste a shorter resume.')
    let message = `Server error ${res.status}`
    try {
      const data = await res.json()
      if (data.error) message = data.error
    } catch { /* non-JSON error response */ }
    throw new Error(message)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx)
      buf = buf.slice(idx + 1)
      if (!line.trim()) continue
      onEvent(JSON.parse(line) as ParseStreamEvent)
    }
  }
}
