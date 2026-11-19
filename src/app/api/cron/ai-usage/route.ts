import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'
import { buildReport, reportEmailHtml, type UsageRow } from '@/lib/ai-usage-alarm'

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf)
}

const PAGE = 1000
const MAX_ROWS = 100_000

// Daily (vercel.json). Emails ALERT_EMAIL (default info@modulehire.com) only when spend
// or a single user crosses a threshold in src/lib/ai-usage-alarm.ts. ?force=1 always
// emails, to check the pipe works.
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  if (!safeCompare(req.headers.get('authorization') ?? '', `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = await createAdminClient()
    const now = new Date()
    const since = new Date(now.getTime() - 8 * 24 * 3600 * 1000).toISOString()

    const rows: UsageRow[] = []
    for (let from = 0; from < MAX_ROWS; from += PAGE) {
      const { data, error } = await admin
        .from('usage_events')
        .select('user_id, created_at, metadata')
        .gte('created_at', since)
        .not('metadata->>model', 'is', null)
        .order('created_at', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) throw error
      rows.push(...((data ?? []) as UsageRow[]))
      if (!data || data.length < PAGE) break
    }

    const report = buildReport(rows, now)
    const force = new URL(req.url).searchParams.get('force') === '1'
    if (report.reasons.length === 0 && !force) {
      return NextResponse.json({ alert: false, report })
    }

    const ids = report.topUsers.map((u) => u.user_id).filter((id) => id !== 'unknown')
    const emails: Record<string, string> = {}
    if (ids.length) {
      const { data } = await admin.from('users').select('id, email').in('id', ids)
      for (const u of data ?? []) emails[u.id as string] = u.email as string
    }

    const to = process.env.ALERT_EMAIL || 'info@modulehire.com'
    const sent = await sendEmail({
      to,
      subject: report.reasons.length
        ? `ModuleHire AI usage alert: about $${report.last24h.usd.toFixed(2)} in 24h`
        : `ModuleHire AI usage check (forced): about $${report.last24h.usd.toFixed(2)} in 24h`,
      html: reportEmailHtml(
        report.reasons.length ? report : { ...report, reasons: ['Forced run, no threshold crossed.'] },
        emails,
      ),
    })
    if (!sent.ok) console.error('[cron/ai-usage] alert email failed:', sent.reason, report)
    return NextResponse.json({ alert: report.reasons.length > 0, emailed: sent.ok, report })
  } catch (error) {
    console.error('[cron/ai-usage]', error)
    return NextResponse.json({ error: 'Usage check failed' }, { status: 500 })
  }
}
