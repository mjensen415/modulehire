import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EditModuleForm from './EditModuleForm'

type PageProps = { params: Promise<{ id: string }> }

export default async function EditModulePage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: module } = await supabase
    .from('modules')
    .select('id, title, content, weight, type, source_company, source_role_title, date_start, date_end, employment_type')
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!module) redirect('/library')

  return (
    <>
      <div className="app-topbar">
        <div>
          <span className="topbar-title">Edit Module</span>
          <span className="topbar-sub">— {module.title}</span>
        </div>
      </div>
      <div className="dash-content" style={{ maxWidth: 680, margin: '0 auto' }}>
        <EditModuleForm module={module} />
      </div>
    </>
  )
}
