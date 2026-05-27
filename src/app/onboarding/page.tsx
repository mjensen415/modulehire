import { redirect } from 'next/navigation'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import OnboardingClient from './OnboardingClient'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/signin')

  const admin = await createAdminClient()
  const [{ data: profile }, { count: moduleCount }, { count: resumeCount }] = await Promise.all([
    admin.from('users').select('onboarding_complete').eq('id', user.id).single(),
    admin.from('modules').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    admin.from('generated_resumes').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
  ])

  if (profile?.onboarding_complete) redirect('/dashboard')

  // If they already have a generated resume, they're done — mark complete and send to dashboard.
  if ((resumeCount ?? 0) > 0) {
    await admin.from('users').update({ onboarding_complete: true }).eq('id', user.id)
    redirect('/dashboard')
  }

  const initialStep: 1 | 2 | 3 = (moduleCount ?? 0) > 0 ? 2 : 1

  return <OnboardingClient initialStep={initialStep} initialModuleCount={moduleCount ?? 0} />
}
