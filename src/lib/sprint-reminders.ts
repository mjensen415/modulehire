// Sprint reminder emails, sent by the daily cron (/api/cron/sprint-reminders):
//   - 3 days before the end: "Your Sprint ends {date}. Your library, resumes and jobs stay put."
//   - on the end day:        "Your Sprint ended. Nothing was charged. Pick up anytime."
// Each send is logged as usage_events 'ev_sprint_reminder' with { kind, sprint_ends_at }, and that
// log is what makes each email go out once per Sprint end date (an extension moves the date, so
// the new end gets its own reminders).
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail, type SendResult } from './email'

export type ReminderKind = 'ends_in_3_days' | 'ended'
type Sender = (opts: { to: string; subject: string; html: string; text: string }) => Promise<SendResult>

const DAY = 86_400_000
const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || 'https://www.modulehire.com').replace(/\/$/, '')

export function reminderEmail(kind: ReminderKind, endsAt: string, name: string | null) {
  const hi = name ? `Hi ${name.split(/\s+/)[0]},` : 'Hi,'
  if (kind === 'ends_in_3_days') {
    const line = `Your Sprint ends ${fmt(endsAt)}. Your library, resumes and jobs stay put.`
    const more = 'It won’t renew. If you need more time, you can extend it from Billing and the new days start after this Sprint ends.'
    return {
      subject: `Your Sprint ends ${fmt(endsAt)}`,
      text: `${hi}\n\n${line}\n\n${more}\n\n${appUrl()}/billing`,
      html: `<p>${hi}</p><p>${line}</p><p>${more}</p><p><a href="${appUrl()}/billing">Your Sprint</a></p>`,
    }
  }
  const line = 'Your Sprint ended. Nothing was charged. Pick up anytime.'
  const more = 'Your account is on Free now. Everything you built is still there.'
  return {
    subject: 'Your Sprint ended',
    text: `${hi}\n\n${line}\n\n${more}\n\n${appUrl()}/dashboard`,
    html: `<p>${hi}</p><p>${line}</p><p>${more}</p><p><a href="${appUrl()}/dashboard">Open ModuleHire</a></p>`,
  }
}

/** Sends due reminders. Addresses ending in .test are logged but never sent (smoke tests). */
export async function runSprintReminders(admin: SupabaseClient, now = new Date(), send: Sender = sendEmail) {
  const soon = new Date(now.getTime() + 3 * DAY).toISOString()
  const recent = new Date(now.getTime() - 2 * DAY).toISOString() // catch up if a run was missed
  const { data: users, error } = await admin
    .from('users')
    .select('id, email, name, sprint_ends_at')
    .not('sprint_ends_at', 'is', null)
    .gt('sprint_ends_at', recent)
    .lte('sprint_ends_at', soon)
  if (error) throw error

  const results: Array<{ user_id: string; kind: ReminderKind; status: 'sent' | 'skipped' | 'already_sent' | 'failed'; reason?: string }> = []
  for (const u of users ?? []) {
    const kind: ReminderKind = new Date(u.sprint_ends_at).getTime() > now.getTime() ? 'ends_in_3_days' : 'ended'
    const { count } = await admin
      .from('usage_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', u.id)
      .eq('action', 'ev_sprint_reminder')
      .eq('metadata->>kind', kind)
      .eq('metadata->>sprint_ends_at', u.sprint_ends_at)
    if ((count ?? 0) > 0) { results.push({ user_id: u.id, kind, status: 'already_sent' }); continue }

    const email = reminderEmail(kind, u.sprint_ends_at, u.name)
    const isTest = typeof u.email === 'string' && u.email.toLowerCase().endsWith('.test')
    const sent: SendResult = !u.email ? { ok: false, reason: 'no email' }
      : isTest ? { ok: true }
      : await send({ to: u.email, subject: email.subject, html: email.html, text: email.text })
    if (!sent.ok) { results.push({ user_id: u.id, kind, status: 'failed', reason: sent.reason }); continue }

    await admin.from('usage_events').insert({
      user_id: u.id,
      action: 'ev_sprint_reminder',
      metadata: { kind, sprint_ends_at: u.sprint_ends_at, ...(isTest ? { skipped: 'test_address' } : {}) },
    })
    results.push({ user_id: u.id, kind, status: isTest ? 'skipped' : 'sent' })
  }
  return results
}
