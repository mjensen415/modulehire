import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveProfileId } from '@/lib/profile'
import EditModuleForm from './EditModuleForm'

type PageProps = { params: Promise<{ id: string }> }

export default async function EditModulePage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profileId = await getActiveProfileId(supabase, user.id)
  const { data: module } = await supabase
    .from('modules')
    .select('id, title, content, weight, pinned, type, source_company, source_role_title, date_start, date_end, employment_type')
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('profile_id', profileId)
    .is('deleted_at', null)
    .single()

  if (!module) redirect('/library')

  const { count: pinnedElsewhere } = await supabase
    .from('modules')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('profile_id', profileId)
    .eq('pinned', true)
    .neq('id', id)
    .is('deleted_at', null)

  return (
    <>
      <div className="app-topbar">
        <div>
          <span className="topbar-title">Edit Module</span>
          <span className="topbar-sub">— {module.title}</span>
        </div>
      </div>
      <div className="dash-content" style={{ maxWidth: 680, margin: '0 auto' }}>
        <EditModuleForm module={module} pinnedElsewhere={pinnedElsewhere ?? 0} />
      </div>
    </>
  )
}
