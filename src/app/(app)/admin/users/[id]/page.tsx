import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const ADMIN_EMAIL = 'mjensen415@gmail.com'

type ModuleRow = {
  id: string
  title: string | null
  content: string | null
  type: string
  weight: string
  source_company: string | null
  source_role_title: string | null
  date_start: string | null
  date_end: string | null
  created_at: string
}

type ResumeRow = {
  id: string
  title: string | null
  ats_score: number | null
  created_at: string
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/signin')
  if (user.email !== ADMIN_EMAIL) redirect('/dashboard')

  const { id } = await params
  const admin = await createAdminClient()

  const [{ data: profile }, { data: modules }, { data: resumes }] = await Promise.all([
    admin.from('users').select('id, email, name, tier, created_at').eq('id', id).single(),
    admin
      .from('modules')
      .select('id, title, content, type, weight, source_company, source_role_title, date_start, date_end, created_at')
      .eq('user_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    admin
      .from('generated_resumes')
      .select('id, title, ats_score, created_at')
      .eq('user_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ])

  if (!profile) notFound()

  // Group modules by (company, role). Each module should belong to exactly one
  // job — a group key containing commas is a red flag for the old parse bug.
  const groups = new Map<string, { company: string; role: string; date: string | null; modules: ModuleRow[] }>()
  for (const m of (modules ?? []) as ModuleRow[]) {
    const company = m.source_company ?? '—'
    const role = m.source_role_title ?? '—'
    const key = `${company}||${role}`
    if (!groups.has(key)) groups.set(key, { company, role, date: m.date_start ?? null, modules: [] })
    groups.get(key)!.modules.push(m)
  }
  // Most recent job first (null dates sort last).
  const groupList = [...groups.values()].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

  const looksMashed = (s: string) => s.includes(',')

  return (
    <>
      <div className="app-topbar">
        <div>
          <span className="topbar-title">{profile.email}</span>
          <span className="topbar-sub">— {profile.tier} · joined {new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </div>
        <Link href="/admin/users" className="btn-ghost" style={{ fontSize: 12 }}>← All users</Link>
      </div>

      <div className="dash-content">
        {/* MODULES BY JOB */}
        <div className="section-card" style={{ marginBottom: 24 }}>
          <div className="section-head">
            <div className="section-head-title">Modules by job</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              {modules?.length ?? 0} modules · {groupList.length} job{groupList.length === 1 ? '' : 's'}
            </div>
          </div>

          {groupList.length === 0 ? (
            <div style={{ padding: 20, fontSize: 13, color: 'var(--text3)' }}>No modules.</div>
          ) : (
            <div style={{ padding: '4px 0' }}>
              {groupList.map(g => {
                const mashed = looksMashed(g.company) || looksMashed(g.role)
                return (
                  <div key={`${g.company}||${g.role}`} style={{ padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{g.role}</span>
                      <span style={{ fontSize: 13, color: 'var(--text3)' }}>· {g.company}</span>
                      {mashed && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--rose)', border: '1px solid var(--rose)', borderRadius: 4, padding: '1px 6px' }}>
                          multi-job — check parse
                        </span>
                      )}
                      <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 'auto' }}>{g.modules.length} module{g.modules.length === 1 ? '' : 's'}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {g.modules.map(m => (
                        <div key={m.id} style={{ fontSize: 12, color: 'var(--text2)', paddingLeft: 12, borderLeft: '2px solid var(--border)' }}>
                          <span style={{ fontWeight: 600 }}>{m.title ?? 'Untitled'}</span>
                          <span style={{ color: 'var(--text3)' }}> · {m.type} · {m.weight}</span>
                          {m.content && <div style={{ marginTop: 2, color: 'var(--text3)', lineHeight: 1.5 }}>{m.content.slice(0, 220)}{m.content.length > 220 ? '…' : ''}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* GENERATED RESUMES */}
        <div className="section-card">
          <div className="section-head">
            <div className="section-head-title">Generated resumes</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>{resumes?.length ?? 0} total</div>
          </div>
          {(resumes?.length ?? 0) === 0 ? (
            <div style={{ padding: 20, fontSize: 13, color: 'var(--text3)' }}>No generated resumes.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr><th>Title</th><th style={{ textAlign: 'center' }}>ATS score</th><th>Created</th></tr>
                </thead>
                <tbody>
                  {(resumes as ResumeRow[]).map(r => (
                    <tr key={r.id}>
                      <td style={{ fontSize: 12 }}>{r.title ?? 'Untitled'}</td>
                      <td style={{ fontSize: 12, textAlign: 'center' }}>{r.ats_score ?? '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text3)' }}>
                        {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
