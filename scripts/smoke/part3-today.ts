/**
 * Part 3: Today home. Brand-new users get the upload card; with data, "Today's three" follows the
 * priority order and a check hides a step for that day only.   npx tsx scripts/smoke/part3-today.ts
 */
import { startSmoke, check, summary } from './harness'

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

async function main() {
  const t = await startSmoke('part3')
  try {
    const empty = await t.api('/dashboard')
    const emptyHtml = await empty.text()
    check(empty.status === 200 && emptyHtml.includes('Upload your resume') && emptyHtml.includes('or a performance review'), 'brand-new user sees the upload card')
    const first = await t.json<{ steps: Array<{ key: string; title: string }> }>('/api/home/today?day=2026-11-18')
    check(first.body.steps[0]?.key === 'library:review-doc' && first.body.steps[1]?.key === 'jobs:first', `empty account: library then first posting (${first.body.steps.map(s => s.key).join(', ')})`)

    // Seed: 3 drafts from a document, 2 confirmed, an application 6 days old with no reply,
    // one 12 days old (too old for the follow-up step), and a saved job with no resume.
    const { data: profile } = await t.admin.from('users').select('active_profile_id').eq('id', t.userId).single()
    const { data: doc } = await t.admin.from('documents').insert({ user_id: t.userId, kind: 'performance_review', filename: '2025 review.pdf' }).select('id').single()
    const mod = (title: string, status: string, docId: string | null) => ({ user_id: t.userId, profile_id: profile?.active_profile_id, title, content: `${title} content.`, type: 'experience', status, source_document_id: docId })
    await t.admin.from('modules').insert([mod('A', 'draft', doc!.id), mod('B', 'draft', doc!.id), mod('C', 'draft', doc!.id), mod('D', 'confirmed', null), mod('E', 'confirmed', null)])
    const { data: apps } = await t.admin.from('job_applications').insert([
      { user_id: t.userId, company: 'Acme', title: 'Head of Community', status: 'applied', applied_at: daysAgo(6) },
      { user_id: t.userId, company: 'Oldco', title: 'Manager', status: 'applied', applied_at: daysAgo(12) },
      { user_id: t.userId, company: 'Saved Inc', title: 'Director', status: 'saved' },
    ]).select('id, company')
    const acme = apps!.find(a => a.company === 'Acme')!

    const day = '2026-11-18'
    const r = await t.json<{ steps: Array<{ key: string; title: string; href: string }> }>(`/api/home/today?day=${day}`)
    const keys = r.body.steps.map(s => s.key)
    console.log('  info  ' + r.body.steps.map(s => s.title).join(' | '))
    check(r.body.steps.length === 3, 'shows three steps')
    check(keys[0] === `review:${doc!.id}` && r.body.steps[0].title === 'Review 3 new modules from 2025 review.pdf', 'draft review first (no interviews)')
    check(keys[1] === `followup:${acme.id}` && r.body.steps[1].href === `/job-tracker?followup=${acme.id}`, 'then follow up with the 6-day-old application')
    check(!keys.some(k => k.includes('Oldco')) && !r.body.steps.some(s => s.title.includes('Oldco')), 'no follow-up for a 12-day-old application')
    check(r.body.steps[2]?.title === 'Make your resume for Saved Inc', `then a saved job with no resume (${r.body.steps[2]?.title})`)

    // Check off the follow-up: gone today, back tomorrow.
    const dis = await t.json('/api/home/today', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step_key: `followup:${acme.id}`, day }) })
    check(dis.status === 200, 'check saves')
    const after = await t.json<{ steps: Array<{ key: string }> }>(`/api/home/today?day=${day}`)
    check(!after.body.steps.some(s => s.key === `followup:${acme.id}`) && after.body.steps.length === 3, 'checked step hidden today, next one moves up')
    const tomorrow = await t.json<{ steps: Array<{ key: string }> }>('/api/home/today?day=2026-11-19')
    check(tomorrow.body.steps.some(s => s.key === `followup:${acme.id}`), 'and back the next day')

    const page = await (await t.api('/dashboard')).text()
    check(page.includes('Today&#x27;s three') || page.includes("Today's three"), 'home renders Today\'s three')
    check(page.includes('Jobs you') && page.includes('Confirmed modules'), 'home renders the stat cards')
  } finally {
    await t.cleanup()
  }
  process.exit(summary() ? 1 : 0)
}
main().catch(e => { console.error(e); process.exit(1) })
