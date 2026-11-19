import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hasActiveSprint } from '@/lib/entitlements'
import { cleanInterviewers, type PracticeFeedback, type PracticeQuestion } from '@/lib/interviews'
import type { PrepData } from '@/lib/interview-prep'
import '@/app/warm.css'
import '../interviews.css'
import PracticeRound, { type PastAnswer } from './PracticeRound'
import BuildPrepButton from './BuildPrepButton'
import RoundWhen from './RoundWhen'
import { voiceHref, voiceTypeForRound } from '@/lib/voice/round-type'

export default async function InterviewPrepPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/signin')

  const { data: iv } = await supabase
    .from('interviews')
    .select('id, round_name, scheduled_at, format, interviewers, notes, prep_opened_at, practice_questions, job_applications(id, company, title, job_description_id)')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!iv) notFound()

  // Opening the page counts as starting prep (Today's three stops asking).
  if (!iv.prep_opened_at) {
    await supabase.from('interviews').update({ prep_opened_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id)
  }

  const app = (Array.isArray(iv.job_applications) ? iv.job_applications[0] : iv.job_applications) as
    { id: string; company: string; title: string; job_description_id: string | null } | null
  const [{ data: me }, { data: prepRow }, { data: answers }] = await Promise.all([
    supabase.from('users').select('tier, sprint_ends_at, plan_period_end, tier_expires_at').eq('id', user.id).single(),
    app?.job_description_id
      ? supabase.from('interview_prep_cache').select('prep_data, generated_at').eq('user_id', user.id).eq('job_description_id', app.job_description_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('practice_answers').select('id, question, answer, feedback, created_at').eq('interview_id', id).eq('user_id', user.id).order('created_at', { ascending: true }),
  ])
  const paid = hasActiveSprint(me)
  const prep = (prepRow?.prep_data ?? null) as PrepData | null
  const people = cleanInterviewers(iv.interviewers)
  const questions = (Array.isArray(iv.practice_questions) ? iv.practice_questions : []) as PracticeQuestion[]

  return (
    <div className="warm">
      <div className="warm-inner warm-narrow">
        <div>
          <Link href="/interviews" className="warm-link" style={{ fontSize: 13 }}>← All interviews</Link>
          <div className="warm-eyebrow" style={{ marginTop: 14 }}>{app ? `${app.title || 'Untitled role'} · ${app.company}` : 'Interview'}</div>
          <h1 className="warm-h1">{iv.round_name}</h1>
          <p className="warm-sub"><RoundWhen iso={iv.scheduled_at} />{iv.format ? ` · ${iv.format}` : ''}</p>
          {iv.notes && <p className="warm-sub" style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{iv.notes}</p>}
        </div>

        {/* Plain <a>, not <Link>: the voice page needs its own CSP, which only a full page load applies. */}
        <a className="iv-voice-banner" href={voiceHref(app?.job_description_id, iv.round_name)}>
          <span className="iv-orb" aria-hidden="true">
            <span className="iv-orb-ring" /><span className="iv-orb-ring" />
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
          </span>
          <span className="iv-voice-text">
            <span className="iv-tile-title">Practice this round out loud</span>
            <span className="iv-tile-sub">
              A {({ recruiter_screen: 'recruiter screen', behavioral: 'hiring manager interview', deep_dive: 'role deep dive' } as const)[voiceTypeForRound(iv.round_name)]} with an AI interviewer{app ? ` who knows the ${app.company} posting` : ''}. You get a scored report when you hang up.
            </span>
          </span>
          <span className="iv-voice-cta">{paid ? 'Start mock interview' : 'Sprint feature'} →</span>
        </a>

        <section className="warm-card">
          <h2 className="warm-h2">Who you&apos;ll meet</h2>
          {people.length === 0 ? (
            <p className="warm-sub">No names yet. Add them from the interviews list when you know.</p>
          ) : (
            <div className="ivp-people">
              {people.map(p => (
                <div key={p.name} className="ivp-person">
                  <div className="ivp-person-name">{p.name}</div>
                  <div className="ivp-person-title">{p.title ?? 'Title not given'}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="warm-card">
          <h2 className="warm-h2">Your story for this job</h2>
          {prep ? (
            <>
              {prep.personal_pitch && <p className="warm-sub" style={{ marginBottom: 14 }}>{prep.personal_pitch}</p>}
              <ul className="ivp-points">
                {(prep.talking_points ?? []).map((t, i) => (
                  <li key={i}>
                    <div className="ivp-req">{t.requirement}</div>
                    <div style={{ fontSize: 14, marginTop: 4 }}>{t.talking_point}</div>
                    {t.your_experience && <div className="warm-muted" style={{ fontSize: 13, marginTop: 4 }}>From your library: {t.your_experience}</div>}
                  </li>
                ))}
              </ul>
              {(prep.questions_to_ask ?? []).length > 0 && (
                <>
                  <div className="ivp-fb-label" style={{ marginTop: 16 }}>Questions to ask them</div>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>
                    {prep.questions_to_ask.map(q => <li key={q}>{q}</li>)}
                  </ul>
                </>
              )}
            </>
          ) : !app ? (
            <p className="warm-sub">Link this round to a tracked job to see talking points built from your confirmed modules.</p>
          ) : !app.job_description_id ? (
            <p className="warm-sub">
              Talking points come from the job posting. <Link href="/generate" className="warm-link">Paste the posting for {app.company}</Link> and they&apos;ll show up here.
            </p>
          ) : paid ? (
            <BuildPrepButton jdId={app.job_description_id} />
          ) : (
            <p className="warm-sub">
              Talking points for this job, built from your confirmed modules, come with a Sprint.{' '}
              <Link href="/pricing" className="warm-link">Start a 30-day Sprint</Link>
            </p>
          )}
        </section>

        <PracticeRound
          interviewId={iv.id}
          initialQuestions={questions}
          initialAnswers={(answers ?? []).map(a => ({ ...a, feedback: a.feedback as PracticeFeedback | null })) as PastAnswer[]}
        />
      </div>
    </div>
  )
}
