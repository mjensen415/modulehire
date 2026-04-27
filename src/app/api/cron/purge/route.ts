import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return timingSafeEqual(aBuf, bBuf)
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[cron/purge] CRON_SECRET is not configured')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const authHeader = req.headers.get('authorization') ?? ''
  if (!safeCompare(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    console.error('[cron/purge] Supabase env vars missing')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  const { data: expired, error } = await supabase.rpc('purge_expired_temp_files')
  if (error) {
    console.error('[cron/purge] rpc failed:', error)
    return NextResponse.json({ error: 'Purge failed' }, { status: 500 })
  }

  const paths: string[] = []
  for (const row of expired ?? []) {
    if (row.docx_path) paths.push(row.docx_path)
    if (row.pdf_path) paths.push(row.pdf_path)
  }

  if (paths.length > 0) {
    await supabase.storage.from('temp').remove(paths)
  }

  return NextResponse.json({ purged: paths.length })
}
