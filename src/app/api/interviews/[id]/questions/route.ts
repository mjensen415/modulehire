import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { checkAndLog } from '@/lib/rate-limit'
import { practiceQuestionsFor, cleanInterviewers } from '@/lib/interviews'

export const maxDuration = 60
type Ctx = { params: Promise<{ id: string }> }

// 8-12 practice questions for this round, made once and cached on the interview row.
export async function POST(req: Request, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const { data: iv } = await supabase
    .from('interviews')
    .select('id, round_name, format, interviewers, practice_questions, job_applications(company, title, jd_text, job_description_id)')
    .eq('id', id).eq('user_id', user.id).maybeSingle()
  if (!iv) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (Array.isArray(iv.practice_questions) && iv.practice_questions.length > 0 && !body?.regenerate) {
    return NextResponse.json({ questions: iv.practice_questions, cached: true })
  }

  const limit = await checkAndLog(supabase, user.id, 'rl_interview_questions', 20, 3600)
  if (!limit.ok) return NextResponse.json({ error: 'Too many requests in the last hour. Try again later.' }, { status: 429 })

  const app = (Array.isArray(iv.job_applications) ? iv.job_applications[0] : iv.job_applications) as
    { company: string; title: string; jd_text: string | null; job_description_id: string | null } | null
  let posting = app?.jd_text ?? null
  if (!posting && app?.job_description_id) {
    const { data: jd } = await supabase.from('job_descriptions').select('raw_text').eq('id', app.job_description_id).maybeSingle()
    posting = jd?.raw_text ?? null
  }
  try {
    const questions = await practiceQuestionsFor(
      { round_name: iv.round_name, format: iv.format, interviewers: cleanInterviewers(iv.interviewers) },
      { title: app?.title ?? null, company: app?.company ?? null, posting },
      user.id,
    )
    if (questions.length < 8) return NextResponse.json({ error: 'We could not write questions for this round. Try again.' }, { status: 502 })
    const admin = await createAdminClient()
    await admin.from('interviews').update({ practice_questions: questions }).eq('id', id).eq('user_id', user.id)
    return NextResponse.json({ questions, cached: false })
  } catch (error) {
    console.error('[interviews/questions]', error)
    return NextResponse.json({ error: 'We could not write questions for this round. Try again.' }, { status: 500 })
  }
}
