/**
 * Sync beta users from Supabase into Brevo as contacts with custom attributes.
 * Powers personalization in beta feedback email campaigns.
 *
 * Usage: npm run sync-brevo
 */
import { createClient } from '@supabase/supabase-js'
import * as path from 'path'
import { fileURLToPath } from 'url'
import * as dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const BREVO_API_KEY = process.env.BREVO_API_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!BREVO_API_KEY) throw new Error('BREVO_API_KEY is not set')
if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')

const BREVO_BASE = 'https://api.brevo.com/v3'

async function brevoFetch(pathname: string, init: RequestInit = {}) {
  const res = await fetch(`${BREVO_BASE}${pathname}`, {
    ...init,
    headers: {
      'api-key': BREVO_API_KEY!,
      'content-type': 'application/json',
      accept: 'application/json',
      ...(init.headers || {}),
    },
  })
  return res
}

async function ensureAttribute(name: string) {
  const res = await brevoFetch(`/contacts/attributes/normal/${name}`, {
    method: 'POST',
    body: JSON.stringify({ type: 'text' }),
  })
  if (res.ok) {
    console.log(`Created attribute: ${name}`)
    return
  }
  // 400 = already exists; safe to ignore
  if (res.status === 400) return
  const text = await res.text()
  throw new Error(`Failed to create attribute ${name}: ${res.status} ${text}`)
}

async function upsertContact(email: string, attributes: Record<string, string | number>) {
  const res = await brevoFetch('/contacts', {
    method: 'POST',
    body: JSON.stringify({ email, attributes, updateEnabled: true }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to upsert contact ${email}: ${res.status} ${text}`)
  }
}

function firstName(name: string | null | undefined): string {
  if (!name) return ''
  const trimmed = name.trim()
  if (!trimmed) return ''
  const parts = trimmed.split(/\s+/)
  return parts[0]
}

async function main() {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log('Ensuring Brevo attributes exist...')
  await ensureAttribute('MODULES_COUNT')
  await ensureAttribute('RESUMES_COUNT')

  console.log('Loading beta users from Supabase...')
  const { data: users, error } = await supabase
    .from('users')
    .select('id, name, email, plan, is_admin')
    .or('plan.eq.pro,is_admin.eq.false')

  if (error) throw error
  if (!users || users.length === 0) {
    console.log('No users to sync.')
    return
  }

  let synced = 0
  for (const user of users) {
    if (!user.email) continue

    const [{ count: modulesCount }, { count: resumesCount }] = await Promise.all([
      supabase
        .from('modules')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('deleted_at', null),
      supabase
        .from('usage_events')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('action', 'generate_resume'),
    ])

    const modules = modulesCount ?? 0
    const resumes = resumesCount ?? 0

    await upsertContact(user.email, {
      FIRSTNAME: firstName(user.name),
      MODULES_COUNT: modules,
      RESUMES_COUNT: resumes,
    })

    console.log(`Synced: ${user.email} (${modules} modules, ${resumes} resumes)`)
    synced++
  }

  console.log(`Done. Synced ${synced} contacts.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
