import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, createAdminClient } from '@/lib/supabase/server'

type UserRow = {
  id: string
  email: string
  name: string | null
  tier: string
  created_at: string
}

export default async function AdminUsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/signin')

  // Gate on is_admin — the same pattern as /admin and every /api/admin route.
  const { data: gate } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (!gate?.is_admin) redirect('/dashboard')

  const admin = await createAdminClient()

  const { data: users } = await admin
    .from('users')
    .select('id, email, name, tier, created_at')
    .order('created_at', { ascending: false })

  const userIds = (users ?? []).map((u: UserRow) => u.id)

  // Tally module + resume counts in one query each, then count in JS (beta scale).
  const [{ data: moduleRows }, { data: resumeRows }] = await Promise.all([
    userIds.length > 0
      ? admin.from('modules').select('user_id').in('user_id', userIds).is('deleted_at', null)
      : Promise.resolve({ data: [] as Array<{ user_id: string }> }),
    userIds.length > 0
      ? admin.from('generated_resumes').select('user_id').in('user_id', userIds).is('deleted_at', null)
      : Promise.resolve({ data: [] as Array<{ user_id: string }> }),
  ])

  const moduleCount: Record<string, number> = {}
  for (const m of moduleRows ?? []) moduleCount[m.user_id] = (moduleCount[m.user_id] ?? 0) + 1
  const resumeCount: Record<string, number> = {}
  for (const r of resumeRows ?? []) resumeCount[r.user_id] = (resumeCount[r.user_id] ?? 0) + 1

  return (
    <>
      <div className="app-topbar">
        <div>
          <span className="topbar-title">Users</span>
          <span className="topbar-sub">— Owner view · {users?.length ?? 0} total</span>
        </div>
      </div>

      <div className="dash-content">
        <div className="section-card">
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Tier</th>
                  <th style={{ textAlign: 'center' }}>Modules</th>
                  <th style={{ textAlign: 'center' }}>Resumes</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {(users ?? []).map((u: UserRow) => (
                  <tr key={u.id}>
                    <td style={{ fontSize: 12 }}>
                      <Link href={`/admin/users/${u.id}`} style={{ color: 'var(--teal)' }}>{u.email}</Link>
                    </td>
                    <td style={{ fontSize: 12 }}>{u.name ?? '—'}</td>
                    <td><span className={`plan-chip plan-${u.tier}`}>{u.tier}</span></td>
                    <td style={{ fontSize: 12, textAlign: 'center' }}>{moduleCount[u.id] ?? 0}</td>
                    <td style={{ fontSize: 12, textAlign: 'center' }}>{resumeCount[u.id] ?? 0}</td>
                    <td style={{ fontSize: 12, color: 'var(--text3)' }}>
                      {new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
