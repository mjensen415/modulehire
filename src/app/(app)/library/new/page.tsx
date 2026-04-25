import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import NewModuleForm from './NewModuleForm'

export default async function NewModulePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <>
      <div className="app-topbar">
        <div>
          <span className="topbar-title">New Module</span>
          <span className="topbar-sub">— Write from scratch</span>
        </div>
        <div className="topbar-actions">
          <Link href="/library" className="btn-ghost" style={{ fontSize: 13 }}>
            ← Back to library
          </Link>
        </div>
      </div>
      <div className="dash-content" style={{ maxWidth: 680, margin: '0 auto' }}>
        <NewModuleForm />
      </div>
    </>
  )
}
