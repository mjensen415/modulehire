import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import VoiceSetupClient from './VoiceSetupClient'

export default async function VoiceAdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/signin')
  const { data: profile } = await supabase.from('users').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) redirect('/dashboard')

  return (
    <>
      <div className="app-topbar">
        <div>
          <span className="topbar-title">Voice interviews</span>
          <span className="topbar-sub">ElevenLabs agent setup</span>
        </div>
      </div>
      <div className="dash-content">
        <VoiceSetupClient />
      </div>
    </>
  )
}
