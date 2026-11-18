import '@/app/warm.css'
import './interviews.css'
import InterviewsClient from './InterviewsClient'

// /interviews?app=<job_application_id> opens "Add a round" for that job (the tracker links here
// when a job moves to Interviewing).
export default async function InterviewsPage({ searchParams }: { searchParams: Promise<{ app?: string }> }) {
  const { app } = await searchParams
  const appId = app && /^[0-9a-f-]{36}$/i.test(app) ? app : null
  return (
    <div className="warm">
      <InterviewsClient initialAppId={appId} />
    </div>
  )
}
