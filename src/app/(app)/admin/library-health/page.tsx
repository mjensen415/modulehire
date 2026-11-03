import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LibraryHealthClient from './LibraryHealthClient'

export default async function LibraryHealthPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/signin')
  const { data: profile } = await supabase.from('users').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) redirect('/dashboard')

  return (
    <>
      <div className="app-topbar">
        <div>
          <span className="topbar-title">Library health</span>
          <span className="topbar-sub">— Old parse damage, previewed and fixed one user at a time</span>
        </div>
      </div>
      <div className="dash-content">
        <LibraryHealthClient currentUserId={user.id} />
      </div>
    </>
  )
}
