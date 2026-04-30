import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { count = 10, prefix = '' } = await req.json().catch(() => ({}))
  const n = Math.min(Math.max(1, Number(count)), 100)

  const adminClient = await createAdminClient()

  // Generate cryptographically random 8-char alphanumeric codes
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/I/1 to avoid confusion
  const generateCode = () =>
    Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')

  const rows = Array.from({ length: n }, () => ({
    code: prefix ? `${prefix}-${generateCode()}` : generateCode(),
    is_active: true,
  }))

  const { data, error } = await adminClient
    .from('beta_codes')
    .insert(rows)
    .select('code')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ codes: data?.map(r => r.code) ?? [] })
}
