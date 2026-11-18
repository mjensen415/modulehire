import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import VoiceInterview from './VoiceInterview'

type Props = { searchParams: Promise<{ jd?: string; session?: string }> }

export default async function VoiceInterviewPage({ searchParams }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/signin?next=/interview-prep/voice')

  const { jd, session } = await searchParams
  const { data: jds } = await supabase
    .from('job_descriptions')
    .select('id, extracted_job_title, extracted_company')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <>
      <div className="app-topbar">
        <div>
          <span className="topbar-title">Voice mock interview</span>
          <span className="topbar-sub">Practice out loud with an AI interviewer that knows your library</span>
        </div>
      </div>
      <div className="dash-content">
        <VoiceInterview
          jobs={(jds ?? []).map((j) => ({
            id: j.id as string,
            label: `${j.extracted_job_title || 'Untitled role'}${j.extracted_company ? ` at ${j.extracted_company}` : ''}`,
          }))}
          initialJdId={jd ?? null}
          initialSessionId={session ?? null}
        />
      </div>
    </>
  )
}
