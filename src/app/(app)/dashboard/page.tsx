import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getUserPlanContext, PLAN_LIMITS } from '@/lib/plans';

// ─── ICONS ───
function IconBlocks() {
  return (
    <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
      <path d="M1.5 4.5h12M1.5 7.5h8M1.5 10.5h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <rect x="10" y="6.5" width="4.5" height="4.5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  );
}
function IconBriefcase() {
  return (
    <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
      <rect x="1" y="5" width="13" height="9" rx="2" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M5 5V3.5A1.5 1.5 0 0 1 6.5 2h2A1.5 1.5 0 0 1 10 3.5V5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M1 9h13" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  );
}
function IconFiles() {
  return (
    <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
      <path d="M8 1H3a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V6L8 1Z" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M8 1v5h5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  );
}
function IconUpload() {
  return (
    <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
      <path d="M7.5 10V1M4 4.5 7.5 1 11 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M1 11v1.5A1.5 1.5 0 0 0 2.5 14h10A1.5 1.5 0 0 0 14 12.5V11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}
function IconPlus() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function IconSearch() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M10 10l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

// ─── COLOR HELPERS ───
type ModuleRecord = { id: string; title: string; weight?: string; themes?: string[]; role_types?: string[]; type?: string; source_company?: string };

function getModuleColor(m: ModuleRecord): string {
  if (m.weight === 'anchor') return 'c-teal';
  if (m.weight === 'strong') return 'c-indigo';
  const themeMap: Record<string, string> = {
    'community-building': 'c-teal', 'developer-relations': 'c-indigo',
    'leadership': 'c-amber', 'content-strategy': 'c-rose',
    'data-driven': 'c-green', 'growth': 'c-green', 'events': 'c-amber',
  };
  for (const t of m.themes ?? []) {
    if (themeMap[t]) return themeMap[t];
  }
  return 'c-amber';
}

function getModuleDomain(m: ModuleRecord): string {
  for (const r of m.role_types ?? []) {
    if (r.includes('community')) return 'Community';
    if (r.includes('developer') || r.includes('devrel')) return 'DevRel';
    if (r.includes('content')) return 'Content';
    if (r.includes('ops')) return 'Operations';
    if (r.includes('marketing')) return 'Marketing';
  }
  for (const t of m.themes ?? []) {
    if (t.includes('leadership') || t.includes('executive')) return 'Leadership';
    if (t.includes('content')) return 'Content';
    if (t.includes('data')) return 'Analytics';
    if (t.includes('events')) return 'Events';
    if (t.includes('partner')) return 'Partnerships';
    if (t.includes('brand')) return 'Brand';
  }
  if (m.type === 'positioning') return 'Positioning';
  if (m.type === 'skill') return 'Skill';
  return 'Experience';
}

function StrengthPips({ weight }: { weight?: string }) {
  const filled = weight === 'anchor' ? 5 : weight === 'strong' ? 3 : 2;
  return (
    <div className="mod-chip-pips">
      {[0,1,2,3,4].map(i => (
        <div key={i} className={`pip${i < filled ? ' on' : ''}`} />
      ))}
    </div>
  );
}

function ModuleChip({ m }: { m: ModuleRecord }) {
  const color = getModuleColor(m);
  const domain = getModuleDomain(m);
  return (
    <Link href="/library" className={`mod-chip ${color}`} style={{ textDecoration: 'none' }}>
      <div className="mod-chip-bar" />
      <div className="mod-chip-domain">{domain}</div>
      <div className="mod-chip-name">{m.title || 'Untitled'}</div>
      <div className="mod-chip-meta">
        <span className="mod-chip-count">{(m.themes ?? []).length} themes</span>
        <StrengthPips weight={m.weight} />
      </div>
    </Link>
  );
}

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const planCtx = await getUserPlanContext(supabase);

  const [
    { data: modules, count: moduleCount },
    { data: resumes, count: resumeCount },
    { data: jds },
  ] = await Promise.all([
    supabase
      .from('modules')
      .select('id, title, weight, themes, role_types, type, source_company', { count: 'exact' })
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(6),
    supabase
      .from('generated_resumes')
      .select('id, title, created_at, positioning_variant', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(4),
    supabase
      .from('job_descriptions')
      .select('id, title, company, created_at')
      .order('created_at', { ascending: false })
      .limit(4),
  ]);

  const displayName = user?.user_metadata?.full_name?.split(' ')[0]
    ?? user?.email?.split('@')[0]
    ?? 'there';

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const stats = [
    { label: 'Modules', value: String(moduleCount ?? 0), change: 'in your library', up: false, color: 'var(--teal)' },
    { label: 'Job descriptions', value: String(jds?.length ?? 0), change: 'analyzed', up: false, color: 'var(--amber)' },
    { label: 'Resumes generated', value: String(resumeCount ?? 0), change: 'all time', up: false, color: 'var(--indigo)' },
    { label: 'Match score avg', value: '—', change: 'run a match to see', up: false, color: 'var(--green)' },
  ];

  const typedModules: ModuleRecord[] = (modules ?? []) as ModuleRecord[];
  const typedResumes = resumes ?? [];
  const typedJds = (jds ?? []) as Array<{ id: string; title?: string; company?: string; created_at: string }>;
  const hasContent = typedModules.length > 0 || typedResumes.length > 0;

  // Plan gate state
  const plan = planCtx?.plan ?? 'free';
  const limits = PLAN_LIMITS[plan];
  const currentModuleCount = planCtx?.module_count ?? (moduleCount ?? 0);
  const resumesThisMonth = planCtx?.resumes_this_month ?? 0;
  const matchesThisMonth = planCtx?.matches_this_month ?? 0;
  const isAdmin = planCtx?.is_admin ?? false;

  const nearModuleLimit = !isAdmin && limits.modules !== -1 && currentModuleCount >= limits.modules - 2;
  const atModuleLimit = !isAdmin && limits.modules !== -1 && currentModuleCount >= limits.modules;
  const nearResumeLimit = !isAdmin && limits.resumes_per_month !== -1 && resumesThisMonth >= limits.resumes_per_month - 1;
  const atResumeLimit = !isAdmin && limits.resumes_per_month !== -1 && resumesThisMonth >= limits.resumes_per_month;
  const atMatchLimit = !isAdmin && limits.matches_per_month !== -1 && matchesThisMonth >= limits.matches_per_month;

  return (
    <>
      {/* TOPBAR */}
      <div className="app-topbar">
        <div>
          <span className="topbar-title">{greeting}, {displayName} 👋</span>
          <span className="topbar-sub">— Here&apos;s your workspace</span>
        </div>
        <div className="topbar-actions">
          <Link href="/generate" className="btn-ghost">
            <IconSearch /> Find matches
          </Link>
          <Link href="/generate" className="btn-primary">
            <IconPlus /> New resume
          </Link>
        </div>
      </div>

      {/* CONTENT */}
      <div className="dash-content">
        {/* PLAN WARNING BANNERS */}
        {nearModuleLimit && !atModuleLimit && (
          <div className="plan-warning-banner">
            ⚠️ You&apos;re using {currentModuleCount}/{limits.modules} modules on the {plan} plan.
            <Link href="/pricing">Upgrade →</Link>
          </div>
        )}
        {nearResumeLimit && !atResumeLimit && (
          <div className="plan-warning-banner">
            ⚠️ You&apos;ve used {resumesThisMonth}/{limits.resumes_per_month} resume generations this month.
            <Link href="/pricing">Upgrade →</Link>
          </div>
        )}

        {/* STATS */}
        <div className="dash-stats">
          {stats.map(s => (
            <div className="stat-card" key={s.label}>
              <div className="stat-label">{s.label}</div>
              <div className="stat-value">{s.value}</div>
              <div className={`stat-change${s.up ? ' up' : ''}`}>{s.change}</div>
              <div className="stat-accent" style={{ background: s.color }} />
            </div>
          ))}
        </div>

        {/* TWO COLUMN */}
        <div className="dash-two-col">

          {/* LEFT: MODULES */}
          <div className="section-card">
            <div className="section-head">
              <div className="section-head-title">
                <IconBlocks /> My Modules
              </div>
              <Link href="/library" className="section-head-action">Manage →</Link>
            </div>
            {typedModules.length > 0 ? (
              <div className="modules-grid">
                {typedModules.map(m => <ModuleChip key={m.id} m={m} />)}
              </div>
            ) : (
              <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16 }}>
                  No modules yet — upload a resume to get started.
                </div>
                <Link href="/upload" className="btn-primary" style={{ display: 'inline-flex' }}>
                  <IconUpload /> Upload resume
                </Link>
              </div>
            )}
          </div>

          {/* RIGHT */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* RESUME */}
            <div className="section-card">
              <div className="section-head">
                <div className="section-head-title"><IconUpload /> Resume</div>
                <Link href="/upload" className="section-head-action">
                  {typedModules.length > 0 ? 'Replace' : 'Upload'}
                </Link>
              </div>
              {typedModules.length > 0 && (
                <div className="resume-row">
                  <div className="resume-row-icon"><IconFiles /></div>
                  <div>
                    <div className="resume-row-name">
                      {typedModules[0]?.source_company
                        ? `${typedModules[0].source_company} resume`
                        : 'Your resume'}
                    </div>
                    <div className="resume-row-meta">
                      {moduleCount} modules extracted
                    </div>
                  </div>
                </div>
              )}
              <Link href="/upload" className="upload-zone">
                <IconUpload />
                <div className="upload-zone-title">
                  {typedModules.length > 0 ? 'Drop an updated resume' : 'Upload your first resume'}
                </div>
                <div className="upload-zone-sub">PDF or DOCX · re-parses and merges modules</div>
              </Link>
            </div>

            {/* QUICK ACTIONS */}
            <div className="section-card">
              <div className="section-head">
                <div className="section-head-title">Quick actions</div>
              </div>
              <div className="quick-actions">
                {[
                  { icon: '🔍', color: 'var(--teal-dim)', title: 'Find matches', desc: 'Paste a job description', href: '/generate', blocked: atMatchLimit },
                  { icon: '⚡', color: 'var(--amber-dim)', title: 'Generate resume', desc: 'Pick modules + role', href: '/generate', blocked: atResumeLimit },
                  { icon: '✏️', color: 'var(--indigo-dim)', title: 'Edit a module', desc: 'Refine your skills', href: '/library', blocked: false },
                  { icon: '📤', color: 'var(--green-dim)', title: 'Upload resume', desc: 'Add or replace source', href: '/upload', blocked: atModuleLimit },
                ].map(a => (
                  <Link
                    href={a.blocked ? '/pricing' : a.href}
                    className="quick-action"
                    key={a.title}
                    style={a.blocked ? { opacity: 0.5 } : undefined}
                  >
                    <div className="quick-action-icon" style={{ background: a.color }}>
                      <span style={{ fontSize: 14 }}>{a.icon}</span>
                    </div>
                    <div className="quick-action-title">{a.blocked ? 'Upgrade' : a.title}</div>
                    <div className="quick-action-desc">{a.blocked ? 'Limit reached — upgrade plan' : a.desc}</div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* JOB DESCRIPTIONS */}
        {typedJds.length > 0 && (
          <div className="section-card" style={{ marginBottom: 16 }}>
            <div className="section-head">
              <div className="section-head-title"><IconBriefcase /> Recent Job Descriptions</div>
              <Link href="/generate" className="section-head-action">New match →</Link>
            </div>
            {typedJds.map(jd => (
              <div className="job-item" key={jd.id}>
                <div className="job-co-logo">
                  {(jd.company ?? 'JD').slice(0, 3).toUpperCase()}
                </div>
                <div className="job-info">
                  <div className="job-title">{jd.title || 'Untitled role'}</div>
                  <div className="job-company">{jd.company || 'Unknown company'}</div>
                </div>
                <div className="job-right">
                  <Link href="/generate" className="generate-btn">Generate ↗</Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* RECENT RESUMES */}
        {typedResumes.length > 0 && (
          <div className="section-card">
            <div className="section-head">
              <div className="section-head-title"><IconFiles /> Recent Generations</div>
              <Link href="/library" className="section-head-action">View all →</Link>
            </div>
            {(typedResumes as Array<{ id: string; title?: string; positioning_variant?: string; created_at: string }>).map((r, i) => (
              <div className="app-row" key={r.id}>
                <div className={`app-dot ${i === 0 ? 'sent' : i === 1 ? 'viewed' : 'draft'}`} />
                <div className="app-row-title">{r.title || 'Untitled resume'}</div>
                <div className="app-row-co">{r.positioning_variant ?? ''}</div>
                <div className="app-row-date">
                  {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
                <div className={`app-badge ${i === 0 ? 'sent' : i === 1 ? 'viewed' : 'draft'}`}>
                  {i === 0 ? 'Latest' : i === 1 ? 'Prev' : 'Older'}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* EMPTY STATE */}
        {!hasContent && (
          <div className="section-card">
            <div style={{ padding: '48px 32px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🧩</div>
              <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 8 }}>
                Your workspace is empty
              </div>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 24, maxWidth: 340, margin: '0 auto 24px' }}>
                Upload your resume and ModuleHire will decompose it into modular skill blocks,
                ready to assemble into tailored resumes for any role.
              </div>
              <Link href="/upload" className="btn-primary" style={{ display: 'inline-flex' }}>
                <IconUpload /> Upload your first resume
              </Link>
            </div>
          </div>
        )}

      </div>
    </>
  );
}
