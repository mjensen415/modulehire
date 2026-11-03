// Marks requests this server makes to its own route handlers in-process (/api/jobs/start →
// generate-resume, etc.). The token is random per server instance and never leaves it, so an
// outside request can't claim to be internal — used to gate options that skip user-facing
// limits, like generate-resume's doc-only mode.
import { randomUUID } from 'crypto'

const INTERNAL_CALL_TOKEN = randomUUID()
const HEADER = 'x-modulehire-internal'

export function internalHeaders(): Record<string, string> {
  return { [HEADER]: INTERNAL_CALL_TOKEN }
}

export function isInternalCall(req: Request): boolean {
  return req.headers.get(HEADER) === INTERNAL_CALL_TOKEN
}

/** A request to one of this app's own handlers, for calling it in-process. */
export function internalRequest(base: string, path: string, body?: unknown, method = 'POST', extraHeaders: Record<string, string> = {}): Request {
  return new Request(new URL(path, base), {
    method,
    headers: { 'Content-Type': 'application/json', ...internalHeaders(), ...extraHeaders },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}
