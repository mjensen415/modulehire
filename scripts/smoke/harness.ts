/**
 * Smoke-test harness: a disposable user (a .test email, random password nobody sees) that signs
 * in, calls the local dev server's routes with its session cookie, and is deleted at the end
 * along with every row it created (FKs cascade from public.users / auth.users).
 *
 * Usage from a test file:  const t = await startSmoke(); try { ... } finally { await t.cleanup() }
 * Needs the dev server on SMOKE_BASE (default http://localhost:3101) and .env.local.
 */
import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { randomBytes } from 'crypto'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
export const BASE = process.env.SMOKE_BASE ?? 'http://localhost:3101'

export type Smoke = {
  admin: SupabaseClient
  userId: string
  email: string
  session: Session
  /** fetch a local route as the test user. */
  api: (path: string, init?: RequestInit) => Promise<Response>
  json: <T = Record<string, unknown>>(path: string, init?: RequestInit) => Promise<{ status: number; body: T }>
  cleanup: () => Promise<void>
}

// @supabase/ssr's cookie format: "base64-" + base64url(JSON session), split into .0/.1 chunks.
function sessionCookies(session: Session): string {
  const ref = new URL(URL_).hostname.split('.')[0]
  const name = `sb-${ref}-auth-token`
  const value = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url')
  const CHUNK = 3180
  if (value.length <= CHUNK) return `${name}=${value}`
  const parts: string[] = []
  for (let i = 0; i * CHUNK < value.length; i++) parts.push(`${name}.${i}=${value.slice(i * CHUNK, (i + 1) * CHUNK)}`)
  return parts.join('; ')
}

export async function startSmoke(label = 'smoke'): Promise<Smoke> {
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } })
  const email = `${label}-${randomBytes(4).toString('hex')}@modulehire.test`
  const password = randomBytes(24).toString('base64url')
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: 'Smoke Test' } })
  if (error || !created.user) throw error ?? new Error('createUser failed')
  const userId = created.user.id
  // Skip onboarding redirects for route tests.
  await admin.from('users').update({ onboarding_complete: true, name: 'Smoke Test' }).eq('id', userId)

  const anon = createClient(URL_, ANON, { auth: { persistSession: false } })
  const { data: signed, error: signErr } = await anon.auth.signInWithPassword({ email, password })
  if (signErr || !signed.session) throw signErr ?? new Error('sign-in failed')
  const cookie = sessionCookies(signed.session)

  const api = (p: string, init: RequestInit = {}) =>
    fetch(BASE + p, { ...init, headers: { ...(init.headers ?? {}), cookie, origin: BASE }, redirect: 'manual' })
  const json = async <T,>(p: string, init: RequestInit = {}) => {
    const res = await api(p, init)
    const text = await res.text()
    let body: unknown = text
    try { body = JSON.parse(text) } catch { /* NDJSON or HTML */ }
    return { status: res.status, body: body as T }
  }
  const cleanup = async () => {
    // Storage files under the user's folder, then the auth user (public.users cascades).
    for (const bucket of ['resumes', 'temp', 'documents']) {
      const { data: files } = await admin.storage.from(bucket).list(userId, { limit: 1000 })
      if (files?.length) await admin.storage.from(bucket).remove(files.map(f => `${userId}/${f.name}`))
    }
    await admin.from('users').delete().eq('id', userId)
    await admin.auth.admin.deleteUser(userId)
    console.log(`cleanup: deleted ${email}`)
  }
  console.log(`smoke user ${email} (${userId})`)
  return { admin, userId, email, session: signed.session, api, json, cleanup }
}

/** Read an NDJSON response into its lines. */
export async function ndjson(res: Response): Promise<Record<string, unknown>[]> {
  const text = await res.text()
  return text.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch { return { raw: l } } })
}

let failures = 0
export function check(cond: unknown, label: string) {
  if (cond) console.log(`  PASS  ${label}`)
  else { failures++; console.log(`  FAIL  ${label}`) }
}
export function summary(): number {
  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
  return failures
}
