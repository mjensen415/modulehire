import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { PlanSelect, AdminToggleButton, PurgeButton } from './UserActions';

function IconShield() {
  return (
    <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
      <path d="M7.5 1.5L2 4v4c0 3.2 2.3 5.8 5.5 6.5C10.7 13.8 13 11.2 13 8V4L7.5 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M5 7.5l2 2 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  is_admin: boolean;
  created_at: string;
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  const { data: profile } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!profile?.is_admin) redirect('/dashboard');

  const adminClient = await createAdminClient();
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? '1', 10));
  const pageSize = 25;
  const offset = (page - 1) * pageSize;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  // Site-wide stats
  const [
    { count: totalUsers },
    { count: freeUsers },
    { count: standardUsers },
    { count: proUsers },
    { count: totalModules },
    { count: resumesThisMonth },
    { count: matchesThisMonth },
  ] = await Promise.all([
    adminClient.from('users').select('id', { count: 'exact', head: true }),
    adminClient.from('users').select('id', { count: 'exact', head: true }).eq('plan', 'free'),
    adminClient.from('users').select('id', { count: 'exact', head: true }).eq('plan', 'standard'),
    adminClient.from('users').select('id', { count: 'exact', head: true }).eq('plan', 'pro'),
    adminClient.from('modules').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    adminClient.from('usage_events').select('id', { count: 'exact', head: true })
      .eq('action', 'generate_resume').gte('created_at', monthStart.toISOString()),
    adminClient.from('usage_events').select('id', { count: 'exact', head: true })
      .eq('action', 'match_job').gte('created_at', monthStart.toISOString()),
  ]);

  // User list paginated
  const { data: users, count: userCount } = await adminClient
    .from('users')
    .select('id, email, name, plan, is_admin, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  // Per-user module counts
  const userIds = (users ?? []).map((u: UserRow) => u.id);
  const { data: moduleCounts } = userIds.length > 0
    ? await adminClient
        .from('modules')
        .select('user_id')
        .in('user_id', userIds)
        .is('deleted_at', null)
    : { data: [] as Array<{ user_id: string }> };

  const moduleCountMap: Record<string, number> = {};
  for (const m of moduleCounts ?? []) {
    moduleCountMap[m.user_id] = (moduleCountMap[m.user_id] ?? 0) + 1;
  }

  // Per-user resume counts this month
  const { data: resumeCounts } = userIds.length > 0
    ? await adminClient
        .from('usage_events')
        .select('user_id')
        .in('user_id', userIds)
        .eq('action', 'generate_resume')
        .gte('created_at', monthStart.toISOString())
    : { data: [] as Array<{ user_id: string }> };

  const resumeCountMap: Record<string, number> = {};
  for (const r of resumeCounts ?? []) {
    resumeCountMap[r.user_id] = (resumeCountMap[r.user_id] ?? 0) + 1;
  }

  const totalPages = Math.ceil((userCount ?? 0) / pageSize);

  const stats = [
    { label: 'Total users', value: totalUsers ?? 0, sub: `${freeUsers ?? 0} free · ${standardUsers ?? 0} standard · ${proUsers ?? 0} pro` },
    { label: 'Total modules', value: totalModules ?? 0, sub: 'active (not deleted)' },
    { label: 'Resumes this month', value: resumesThisMonth ?? 0, sub: 'generate_resume events' },
    { label: 'Matches this month', value: matchesThisMonth ?? 0, sub: 'match_job events' },
  ];

  return (
    <>
      <div className="app-topbar">
        <div>
          <span className="topbar-title"><span style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }}><IconShield /></span> Admin</span>
          <span className="topbar-sub">— Site management</span>
        </div>
      </div>

      <div className="dash-content">
        {/* STATS */}
        <div className="dash-stats" style={{ marginBottom: 24 }}>
          {stats.map(s => (
            <div className="stat-card" key={s.label}>
              <div className="stat-label">{s.label}</div>
              <div className="stat-value">{s.value}</div>
              <div className="stat-change">{s.sub}</div>
              <div className="stat-accent" style={{ background: 'var(--teal)' }} />
            </div>
          ))}
        </div>

        {/* USER TABLE */}
        <div className="section-card">
          <div className="section-head">
            <div className="section-head-title">Users</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              Page {page} of {totalPages} · {userCount ?? 0} total
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Plan</th>
                  <th>Admin</th>
                  <th>Modules</th>
                  <th>Resumes/mo</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(users ?? []).map((u: UserRow) => (
                  <tr key={u.id}>
                    <td style={{ fontSize: 12 }}>{u.email}</td>
                    <td style={{ fontSize: 12 }}>{u.name ?? '—'}</td>
                    <td>
                      <span className={`plan-chip plan-${u.plan}`}>{u.plan}</span>
                    </td>
                    <td style={{ fontSize: 12, color: u.is_admin ? 'var(--teal)' : 'var(--text3)' }}>
                      {u.is_admin ? 'Yes' : 'No'}
                    </td>
                    <td style={{ fontSize: 12, textAlign: 'center' }}>{moduleCountMap[u.id] ?? 0}</td>
                    <td style={{ fontSize: 12, textAlign: 'center' }}>{resumeCountMap[u.id] ?? 0}</td>
                    <td style={{ fontSize: 12, color: 'var(--text3)' }}>
                      {new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <PlanSelect userId={u.id} currentPlan={u.plan} />
                        <AdminToggleButton userId={u.id} isAdmin={u.is_admin} />
                        <PurgeButton userId={u.id} email={u.email} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* PAGINATION */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 8, padding: '16px 20px', justifyContent: 'flex-end' }}>
              {page > 1 && (
                <Link href={`/admin?page=${page - 1}`} className="btn-ghost" style={{ fontSize: 12 }}>← Prev</Link>
              )}
              {page < totalPages && (
                <Link href={`/admin?page=${page + 1}`} className="btn-ghost" style={{ fontSize: 12 }}>Next →</Link>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
