import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { runSprintReminders } from '@/lib/sprint-reminders'

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf)
}

// Daily (vercel.json): "ends in 3 days" and "ended" Sprint emails, once each per end date.
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  if (!safeCompare(req.headers.get('authorization') ?? '', `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const admin = await createAdminClient()
    const results = await runSprintReminders(admin)
    const failed = results.filter(r => r.status === 'failed')
    if (failed.length) console.error('[cron/sprint-reminders] failed sends', failed)
    return NextResponse.json({ results })
  } catch (error) {
    console.error('[cron/sprint-reminders]', error)
    return NextResponse.json({ error: 'Reminder run failed' }, { status: 500 })
  }
}
