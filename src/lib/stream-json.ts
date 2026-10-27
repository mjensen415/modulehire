// Reads a resume JSON object as the model streams it, and hands over the pieces as soon as
// they're complete: the "summary" string, then each object in one array field ("experience"
// or "work_experience"). Lets generate-resume show the resume filling in before the whole
// response has arrived. The full text is still parsed at the end; this is for display.

export type StreamPieces = { summary?: string; items: Record<string, unknown>[] }

export function createResumeStreamReader(arrayKey: string) {
  let buf = ''
  let summaryDone = false
  let arrayStart = -1
  let scanPos = 0
  let depth = 0
  let inString = false
  let escaped = false
  let objStart = -1
  let arrayDone = false
  const arrayRe = new RegExp(`"${arrayKey}"\\s*:\\s*\\[`)

  return function push(chunk: string): StreamPieces {
    buf += chunk
    const out: StreamPieces = { items: [] }

    if (!summaryDone) {
      const m = buf.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/)
      if (m) {
        summaryDone = true
        try { out.summary = JSON.parse(`"${m[1]}"`) } catch { out.summary = m[1] }
      }
    }

    if (arrayStart < 0) {
      const m = arrayRe.exec(buf)
      if (m) { arrayStart = m.index + m[0].length; scanPos = arrayStart }
    }
    if (arrayStart < 0 || arrayDone) return out

    for (let i = scanPos; i < buf.length; i++) {
      const ch = buf[i]
      if (inString) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') { inString = true; continue }
      if (ch === '{') {
        if (depth === 0) objStart = i
        depth++
      } else if (ch === '}') {
        depth--
        if (depth === 0 && objStart >= 0) {
          try { out.items.push(JSON.parse(buf.slice(objStart, i + 1))) } catch { /* the final parse will catch it */ }
          objStart = -1
        }
      } else if (ch === ']' && depth === 0) {
        arrayDone = true
        scanPos = i + 1
        return out
      }
    }
    scanPos = buf.length
    return out
  }
}
