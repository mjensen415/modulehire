/**
 * Part 6: Sprints. Free limits gate before any AI; two sprint_30 purchases extend sprint_ends_at to
 * ~60 days (and a replayed webhook changes nothing); a 90-day Sprint pools 3x allowances; an
 * expired Sprint drops to Free limits with every resume and module still there; reminder emails
 * are logged once each.
 *
 * Webhook events are signed locally with STRIPE_WEBHOOK_SECRET (the same thing `stripe trigger`
 * does), so no Checkout session is created. Reminder emails go to .test addresses, which the job
 * logs but never sends.   npx tsx scripts/smoke/part6-sprints.ts
 */
import Stripe from 'stripe'
import { startSmoke, check, summary, BASE, type Smoke } from './harness'

const DAY = 86_400_000
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_unused')

async function sendCheckoutCompleted(userId: string, sessionId: string, sku: 'sprint_30' | 'sprint_90') {
  const payload = JSON.stringify({
    id: `evt_${sessionId}`,
    object: 'event',
    type: 'checkout.session.completed',
    data: { object: {
      id: sessionId, object: 'checkout.session', mode: 'payment', payment_status: 'paid',
      amount_total: sku === 'sprint_30' ? 1900 : 4500, client_reference_id: userId, customer: null,
      metadata: { supabase_user_id: userId, sku },
    } },
  })
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! })
  const res = await fetch(`${BASE}/api/stripe/webhook`, { method: 'POST', headers: { 'stripe-signature': header, 'content-type': 'application/json' }, body: payload })
  return { status: res.status, body: await res.json().catch(() => ({})) as { sprint_ends_at?: string } }
}
const endsAt = async (t: Smoke) => (await t.admin.from('users').select('sprint_ends_at').eq('id', t.userId).single()).data?.sprint_ends_at as string | null
const daysFromNow = (iso: string | null) => (iso ? (new Date(iso).getTime() - Date.now()) / DAY : NaN)
const runReminders = async () => {
  const res = await fetch(`${BASE}/api/cron/sprint-reminders`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
  return (await res.json()) as { results: Array<{ user_id: string; kind: string; status: string }> }
}

async function main() {
  const t = await startSmoke('part6')
  const t90 = await startSmoke('part6b')
  try {
    await t.json('/api/my-modules')
    const { data: profile } = await t.admin.from('users').select('active_profile_id').eq('id', t.userId).single()
    await t.admin.from('modules').insert([1, 2, 3].map(i => ({ user_id: t.userId, profile_id: profile?.active_profile_id, title: `Module ${i}`, content: `Did thing ${i}.`, type: 'experience', status: 'confirmed' })))
    await t.admin.from('generated_resumes').insert([1, 2].map(i => ({ user_id: t.userId, title: `Resume ${i}`, is_temp: false })))
    const posting = 'Head of Community at Acme. You will grow our developer community, run programs, and partner with product on feedback loops. '.repeat(3)

    // ── Free ──
    const me0 = await t.json<{ sprint_active: boolean }>('/api/me')
    check(me0.body.sprint_active === false, 'new account is on Free')
    const blocked = await t.json<{ code: string; error: string }>('/api/jobs/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raw_text: posting }) })
    check(blocked.status === 402 && blocked.body.code === 'sprint_required', `third tailored resume refused before any AI (${blocked.status})`)
    console.log(`  info  "${blocked.body.error}"`)
    check(!blocked.body.error.includes('—'), 'limit message has no em dash')
    const edit = await t.json<{ code: string }>('/api/resume-docs/00000000-0000-0000-0000-000000000000', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    check(edit.status === 402 && edit.body.code === 'sprint_required', 'live editing needs a Sprint')
    const out = await t.json<{ code: string }>('/api/outreach-draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    check(out.status === 402, 'outreach drafts need a Sprint')
    const checkout = await t.json('/api/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku: 'five_pack' }) })
    check(checkout.status === 400, 'old SKUs are gone from checkout')
    const oldRoute = await t.api('/api/checkout', { method: 'POST' })
    check(oldRoute.status === 404 || oldRoute.status === 405, `/api/checkout removed (${oldRoute.status})`)

    // ── Buy sprint_30 twice ──
    const s1 = `cs_smoke_${t.userId.slice(0, 8)}_1`
    const r1 = await sendCheckoutCompleted(t.userId, s1, 'sprint_30')
    check(r1.status === 200, `webhook 1 accepted (${r1.status})`)
    const d1 = daysFromNow(await endsAt(t))
    check(d1 > 29.9 && d1 <= 30.01, `first Sprint ends in 30 days (${d1.toFixed(2)})`)
    const replay = await sendCheckoutCompleted(t.userId, s1, 'sprint_30')
    check(replay.status === 200 && Math.abs(daysFromNow(await endsAt(t)) - d1) < 0.01, 'replayed webhook changes nothing')
    await sendCheckoutCompleted(t.userId, `cs_smoke_${t.userId.slice(0, 8)}_2`, 'sprint_30')
    const d2 = daysFromNow(await endsAt(t))
    check(d2 > 59.9 && d2 <= 60.01, `second purchase extends to 60 days (${d2.toFixed(2)})`)
    const { data: purchases } = await t.admin.from('sprint_purchases').select('sku, amount_cents, starts_at, ends_at').eq('user_id', t.userId).order('starts_at')
    check(purchases?.length === 2 && purchases[1].starts_at === purchases[0].ends_at, 'two purchases, the second starting when the first ends')
    const bad = await fetch(`${BASE}/api/stripe/webhook`, { method: 'POST', headers: { 'stripe-signature': 't=1,v1=bad' }, body: '{}' })
    check(bad.status === 400, 'unsigned webhook rejected')

    const me1 = await t.json<{ sprint_active: boolean }>('/api/me')
    check(me1.body.sprint_active === true, 'Sprint active')
    const unblocked = await t.json<{ code?: string }>('/api/resume-docs/00000000-0000-0000-0000-000000000000', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    check(unblocked.status !== 402, `editing allowed with a Sprint (${unblocked.status})`)
    const billing = await (await t.api('/billing')).text()
    check(billing.includes('days left') && billing.includes('Add 30 days'), 'Billing shows days left and Extend')
    const ent = await import('../../src/lib/entitlements')
    const e1 = await ent.entitlements(t.admin, t.userId)
    check(e1.tailored.limit === 100 && e1.documents.limit === 30 && e1.graded.limit === 60, '30-day allowances: 100 / 30 / 60')

    // ── 90-day pools ──
    await sendCheckoutCompleted(t90.userId, `cs_smoke_${t90.userId.slice(0, 8)}_90`, 'sprint_90')
    const e90 = await ent.entitlements(t90.admin, t90.userId)
    check(Math.abs(daysFromNow(await endsAt(t90)) - 90) < 0.05 && e90.tailored.limit === 300 && e90.graded.limit === 180, '90-day Sprint pools 3x (300 / 90 / 180)')

    // ── Reminders: 3 days before ──
    const soon = new Date(Date.now() + 2.5 * DAY).toISOString()
    await t.admin.from('users').update({ sprint_ends_at: soon }).eq('id', t.userId)
    const rem1 = (await runReminders()).results.filter(r => r.user_id === t.userId)
    check(rem1.length === 1 && rem1[0].kind === 'ends_in_3_days' && rem1[0].status === 'skipped', `3-day reminder logged (${JSON.stringify(rem1)})`)
    const rem1b = (await runReminders()).results.filter(r => r.user_id === t.userId)
    check(rem1b[0]?.status === 'already_sent', 'not sent twice')

    // ── Expire ──
    const past = new Date(Date.now() - 3600_000).toISOString()
    await t.admin.from('users').update({ sprint_ends_at: past }).eq('id', t.userId)
    const rem2 = (await runReminders()).results.filter(r => r.user_id === t.userId)
    check(rem2.length === 1 && rem2[0].kind === 'ended', 'end-day reminder logged')
    const rem2b = (await runReminders()).results.filter(r => r.user_id === t.userId)
    check(rem2b[0]?.status === 'already_sent', 'end-day reminder not sent twice')
    const { count: logged } = await t.admin.from('usage_events').select('id', { count: 'exact', head: true }).eq('user_id', t.userId).eq('action', 'ev_sprint_reminder')
    check(logged === 2, `exactly two reminder events (${logged})`)

    const me2 = await t.json<{ sprint_active: boolean }>('/api/me')
    check(me2.body.sprint_active === false, 'expired Sprint is back on Free')
    const again = await t.json<{ code: string }>('/api/jobs/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raw_text: posting }) })
    check(again.status === 402, 'Free tailored limit applies again')
    const locked = await t.json('/api/resume-docs/00000000-0000-0000-0000-000000000000', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    check(locked.status === 402, 'editing locked again')
    const { count: mods } = await t.admin.from('modules').select('id', { count: 'exact', head: true }).eq('user_id', t.userId).is('deleted_at', null)
    const lib = await t.json<{ modules: unknown[] }>('/api/my-modules')
    const files = await t.json<{ files: unknown[] }>('/api/files')
    check(mods === 3 && lib.body.modules.length === 3, 'every module still there and usable')
    check(files.body.files.length === 2, 'every resume still listed')
    const billing2 = await (await t.api('/billing')).text()
    check(billing2.includes('on Free') && billing2.includes('Start a 30-day Sprint'), 'Billing offers a new Sprint')

    const pricing = await (await fetch(`${BASE}/pricing`)).text()
    check(['Sprints, not subscriptions', 'No auto-renew. One payment, and we never charge you again unless you choose to.', 'Built to get you hired, not to keep you paying.', 'Download or delete anytime.'].every(x => pricing.includes(x.replace(/'/g, '&#x27;')) || pricing.includes(x)), 'pricing page headline and three promises')
  } finally {
    await t.cleanup()
    await t90.cleanup()
  }
  process.exit(summary() ? 1 : 0)
}
main().catch(e => { console.error(e); process.exit(1) })
