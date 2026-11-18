import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getActiveProfileId } from '@/lib/profile'
import { getUsableModules } from '@/lib/usable-modules'
import { gradePracticeAnswer, practiceAllowed } from '@/lib/interviews'

export const maxDuration = 60
type Ctx = { params: Promise<{ id: string }> }

const words = (t: string) => new Set(t.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [])

// Grade one practice answer. Saved with the service role: graded answers count toward limits.
export async function POST(req: Request, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const question = typeof body?.question === 'string' ? body.question.trim().slice(0, 500) : ''
  const answer = typeof body?.answer === 'string' ? body.answer.trim() : ''
  if (!question) return NextResponse.json({ error: 'Pick a question first.' }, { status: 400 })
  if (answer.split(/\s+/).length < 15) return NextResponse.json({ error: 'Write a few sentences, the way you would say it out loud.' }, { status: 400 })
  if (answer.length > 8000) return NextResponse.json({ error: 'That answer is too long to grade. Keep it under about 1,000 words.' }, { status: 400 })

  const { data: iv } = await supabase.from('interviews').select('id, round_name, job_applications(company, title)').eq('id', id).eq('user_id', user.id).maybeSingle()
  if (!iv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const allowed = await practiceAllowed(supabase, user.id, id)
  if (!allowed.ok) return NextResponse.json({ error: allowed.message, code: allowed.code }, { status: allowed.code === 'PRACTICE_FAIR_USE' ? 429 : 403 })

  // Confirmed modules only, the most related to this question and answer first.
  const profileId = await getActiveProfileId(supabase, user.id)
  const { data: mods } = await getUsableModules(supabase, 'id, title, content').eq('user_id', user.id).eq('profile_id', profileId)
  const target = words(`${question} ${answer}`)
  const ranked = ((mods ?? []) as Array<{ id: string; title: string; content: string }>)
    .map(m => ({ m, score: [...words(`${m.title} ${m.content}`)].filter(w => target.has(w)).length }))
    .sort((a, b) => b.score - a.score)
    .map(r => r.m)

  const app = (Array.isArray(iv.job_applications) ? iv.job_applications[0] : iv.job_applications) as { company: string; title: string } | null
  try {
    const feedback = await gradePracticeAnswer(
      { question, answer, round_name: iv.round_name, job_title: app?.title ?? null, company: app?.company ?? null },
      ranked,
      user.id,
    )
    const admin = await createAdminClient()
    const { data: row, error } = await admin
      .from('practice_answers')
      .insert({ user_id: user.id, interview_id: id, question, answer, feedback })
      .select('id, created_at')
      .single()
    if (error) throw error
    return NextResponse.json({ id: row.id, created_at: row.created_at, question, answer, feedback })
  } catch (error) {
    console.error('[interviews/practice]', error)
    return NextResponse.json({ error: 'We could not grade that answer. Try again.' }, { status: 500 })
  }
}
