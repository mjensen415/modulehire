/**
 * Part 4: Interviews. Paste an email → confirm → round saved (email kept as a document); the home
 * page asks to prep until the prep page is opened; 8-12 practice questions; a graded answer whose
 * tighter version only uses the user's own facts; Try again; Free gets one practice round.
 *   npx tsx scripts/smoke/part4-interviews.ts
 */
import { startSmoke, check, summary } from './harness'
import { unsupportedTerms } from '../../src/lib/fact-check'

async function main() {
  const t = await startSmoke('part4')
  try {
    await t.json('/api/my-modules') // creates the default profile, as the app does on first use
    const { data: profile } = await t.admin.from('users').select('active_profile_id').eq('id', t.userId).single()
    const mods = [
      { title: 'Community Program Launch', content: 'Launched the Builders program, growing it from 0 to 1,400 active members in nine months.' },
      { title: 'Forum Migration', content: 'Led the migration of 3 regional forums onto one platform, finishing two weeks early.' },
      { title: 'Health Dashboard', content: 'Built a community health dashboard that cut bug triage time from 6 days to 2 days.' },
    ]
    const { data: modRows } = await t.admin.from('modules').insert(mods.map(m => ({ ...m, user_id: t.userId, profile_id: profile?.active_profile_id, type: 'experience', status: 'confirmed' }))).select('id, title, content')
    await t.admin.from('modules').insert({ user_id: t.userId, profile_id: profile?.active_profile_id, title: 'Draft only', content: 'Ran a 900-person summit in Lisbon.', type: 'experience', status: 'draft' })
    const { data: app } = await t.admin.from('job_applications').insert({ user_id: t.userId, company: 'Brightline Health', title: 'Head of Community', status: 'interviewing', jd_text: 'Brightline Health is hiring a Head of Community to grow our patient and clinician community, launch programs, and work with product on feedback loops.' }).select('id').single()

    // Email two days out, 2pm Pacific.
    const when = new Date(Date.now() + 2 * 86_400_000)
    const dayName = when.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/Los_Angeles' })
    const dateText = when.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' })
    const email = `Hi Smoke,

Thanks for chatting with us! Next step is a 45-minute video interview with Dana Ruiz, Director of Community, and Omar Haddad, VP Product, on ${dayName}, ${dateText} at 2:00pm PT.

Zoom: https://zoom.us/j/555123
Please come ready to talk about a community program you launched.

Best,
Leah Park
Recruiting, Brightline Health`
    const ex = await t.json<{ extract: { company: string; round_name: string; scheduled_at: string | null; format: string; interviewers: Array<{ name: string; title: string }>; notes: string }; source_document_id: string; suggested_job_application_id: string }>(
      '/api/interviews/from-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email_text: email }) })
    console.log('  info  ' + JSON.stringify(ex.body.extract))
    check(ex.status === 200, `from-email 200 (${ex.status})`)
    const x = ex.body.extract
    const expected = new Date(`${new Date(when.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }))
      .toISOString().slice(0, 10)}T14:00:00-08:00`)
    check(x.scheduled_at && Math.abs(new Date(x.scheduled_at).getTime() - expected.getTime()) < 60_000, `time read as 2pm PT on ${dateText} (${x.scheduled_at})`)
    check(x.format === 'video', 'format video')
    check(x.interviewers.length === 2 && x.interviewers.some(p => p.name === 'Dana Ruiz') && !x.interviewers.some(p => /Leah/.test(p.name)), 'interviewers are Dana and Omar, not the recruiter')
    check(ex.body.suggested_job_application_id === app!.id, 'matched the tracked Brightline job')
    const { data: emailDoc } = await t.admin.from('documents').select('kind, raw_text').eq('id', ex.body.source_document_id).single()
    check(emailDoc?.kind === 'interview_email' && emailDoc.raw_text?.includes('Dana Ruiz'), 'email kept as an interview_email document')
    const { count: before } = await t.admin.from('interviews').select('id', { count: 'exact', head: true }).eq('user_id', t.userId)
    check(before === 0, 'nothing saved before confirmation')

    const saved = await t.json<{ interview: { id: string } }>('/api/interviews', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_application_id: app!.id, round_name: x.round_name, scheduled_at: x.scheduled_at, format: x.format, interviewers: x.interviewers, notes: x.notes, source_document_id: ex.body.source_document_id }),
    })
    check(saved.status === 201, 'round saved after confirming')
    const ivId = saved.body.interview.id

    const today = new Date().toISOString().slice(0, 10)
    const steps = await t.json<{ steps: Array<{ key: string; title: string; href: string }> }>(`/api/home/today?day=${today}`)
    check(steps.body.steps[0]?.key === `prep:${ivId}` && steps.body.steps[0].title.includes('Brightline Health'), `home: first step is prep (${steps.body.steps[0]?.title})`)
    const page = await t.api(`/interviews/${ivId}`)
    const html = await page.text()
    check(page.status === 200 && html.includes('Dana Ruiz') && html.includes('Who you'), 'prep page shows who you will meet')
    const steps2 = await t.json<{ steps: Array<{ key: string }> }>(`/api/home/today?day=${today}`)
    check(!steps2.body.steps.some(s => s.key === `prep:${ivId}`), 'opening prep clears the home step')
    const list = await (await t.api('/interviews')).text()
    check(list.includes('Every round'), '/interviews renders')

    const qs = await t.json<{ questions: Array<{ question: string }> }>(`/api/interviews/${ivId}/questions`, { method: 'POST' })
    console.log('  info  ' + qs.body.questions?.slice(0, 3).map(q => q.question).join(' | '))
    check(qs.body.questions?.length >= 8 && qs.body.questions.length <= 12, `8-12 questions (${qs.body.questions?.length})`)
    const again = await t.json<{ cached: boolean }>(`/api/interviews/${ivId}/questions`, { method: 'POST' })
    check(again.body.cached === true, 'questions cached on the round')

    const q = qs.body.questions[0].question
    const answer = 'At my last job I started a program for our most active members. I picked the first group myself, set up a monthly call, and wrote a simple guide. It grew to 1,400 active members in nine months, and a lot of product feedback came out of it. I think that is the thing I am proudest of because I built it from nothing.'
    const g1 = await t.json<{ feedback: { scores: Record<string, number>; strongest_part: string; one_fix: string; suggested_story: { module_id: string } | null; tighter_version: string | null } }>(
      `/api/interviews/${ivId}/practice`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q, answer }) })
    check(g1.status === 200, `graded (${g1.status})`)
    const fb = g1.body.feedback
    console.log('  info  ' + JSON.stringify(fb).slice(0, 600))
    check(['structure', 'specificity', 'relevance', 'length'].every(k => fb.scores[k] >= 1 && fb.scores[k] <= 5), 'four 1-5 scores')
    check(fb.strongest_part && fb.one_fix, 'strongest part and one fix')
    check(fb.suggested_story && modRows!.some(m => m.id === fb.suggested_story!.module_id), 'suggests one of the confirmed modules')
    check(![fb.strongest_part, fb.one_fix, fb.tighter_version ?? ''].some(f => /<\/?[a-z_]+|<parameter/i.test(f)), 'no leaked markup in feedback')
    const sources = [answer, ...modRows!.map(m => `${m.title}\n${m.content}`)]
    check(!fb.tighter_version || unsupportedTerms(fb.tighter_version, sources, ['Brightline Health', 'Head of Community']).length === 0, 'tighter version uses only the answer and confirmed modules')
    check(!fb.tighter_version?.includes('Lisbon') && !fb.tighter_version?.includes('900'), 'never pulls from a draft module')

    const g2 = await t.json(`/api/interviews/${ivId}/practice`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q, answer: answer + ' We did it with no budget, and I ran the first ten calls myself.' }) })
    check(g2.status === 200, 'try again grades a second attempt')
    const { count: attempts } = await t.admin.from('practice_answers').select('id', { count: 'exact', head: true }).eq('interview_id', ivId)
    check(attempts === 2, 'both attempts kept for comparison')

    // Free: one practice round.
    const other = await t.json<{ interview: { id: string } }>('/api/interviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ round_name: 'Panel', job_application_id: app!.id }) })
    const blocked = await t.json<{ code: string }>(`/api/interviews/${other.body.interview.id}/practice`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'Tell me about yourself.', answer }) })
    check(blocked.status === 403 && blocked.body.code === 'PRACTICE_LIMIT_REACHED', `second round refused on Free (${blocked.status})`)
    // Deleting the round doesn't reset it.
    await t.json(`/api/interviews/${ivId}`, { method: 'DELETE' })
    const stillBlocked = await t.json<{ code: string }>(`/api/interviews/${other.body.interview.id}/practice`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'Tell me about yourself.', answer }) })
    check(stillBlocked.status === 403, 'deleting the practiced round does not reset the Free round')

    const { createClient } = await import('@supabase/supabase-js')
    const userClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: `Bearer ${t.session.access_token}` } } })
    const { error: insErr } = await userClient.from('practice_answers').insert({ user_id: t.userId, question: 'x', answer: 'y' })
    const { error: qErr } = await userClient.from('interviews').update({ practice_questions: [] }).eq('id', other.body.interview.id)
    check(insErr && qErr, 'users cannot write practice answers or cached questions directly')
  } finally {
    await t.cleanup()
  }
  process.exit(summary() ? 1 : 0)
}
main().catch(e => { console.error(e); process.exit(1) })
