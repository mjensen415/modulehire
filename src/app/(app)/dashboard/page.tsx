import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { moduleLimit, isProTier, FREE_MONTHLY_GENERATIONS } from '@/lib/plan';
import { getActiveProfileId } from '@/lib/profile';
import { DIMENSIONS, DIMENSION_LABELS, type Dimension } from '@/lib/dimensions';
import MatchReport, { type MatchReportData } from '@/components/MatchReport';
import DashboardProfileSwitch from './DashboardProfileSwitch';
import DashboardBreakdownRow from './DashboardBreakdownRow';

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
function IconBolt() {
  return (
    <svg width="20" height="20" viewBox="0 0 15 15" fill="none">
      <path d="M8 1 2.5 8.5H7L6 14l6-8h-4.5L8 1Z" stroke="var(--teal)" strokeWidth="1.3" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}
function IconUploadLarge() {
  return (
    <svg width="20" height="20" viewBox="0 0 15 15" fill="none">
      <path d="M7.5 10V1M4 4.5 7.5 1 11 4.5" stroke="var(--teal)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M1 11v1.5A1.5 1.5 0 0 0 2.5 14h10A1.5 1.5 0 0 0 14 12.5V11" stroke="var(--teal)" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}
function IconSearchLarge() {
  return (
    <svg width="20" height="20" viewBox="0 0 14 14" fill="none">
      <circle cx="6" cy="6" r="4.5" stroke="var(--teal)" strokeWidth="1.3"/>
      <path d="M10 10l2.5 2.5" stroke="var(--teal)" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <circle cx="6.5" cy="6.5" r="6" stroke="var(--teal)" strokeWidth="1.2"/>
      <path d="M4 6.5 5.8 8.3 9 5" stroke="var(--teal)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function strengthFromCount(count: number) {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 10) return 3;
  if (count <= 20) return 4;
  return 5;
}

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  const { data: onboardingProfile } = await supabase
    .from('users')
    .select('onboarding_complete, location, preferences')
    .eq('id', user.id)
    .single();
  if (!onboardingProfile?.onboarding_complete) redirect('/onboarding');

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const activeProfileId = await getActiveProfileId(supabase, user.id);

  const [
    { data: modules, count: moduleCount },
    { data: resumes, count: resumeCount },
    { data: jds, count: jdCount },
    { data: recentJdFull },
    { data: scoreRows },
    { data: profileRow },
    { count: resumesThisMonthCount },
    { data: activeProfile },
    { data: latestResume },
    { count: jobExperienceCount },
  ] = await Promise.all([
    supabase
      .from('modules')
      .select('id, title, weight, themes, role_types, type, source_company, dimensions', { count: 'exact' })
      .eq('user_id', user!.id)
      .eq('profile_id', activeProfileId)
      .is('deleted_at', null),
    supabase
      .from('generated_resumes')
      .select('id, title, created_at, positioning_variant, ats_score, job_descriptions (extracted_company, extracted_role_type, extracted_job_title)', { count: 'exact' })
      .eq('user_id', user!.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(3),
    supabase
      .from('job_descriptions')
      .select('id, extracted_company, extracted_role_type, created_at', { count: 'exact' })
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(4),
    supabase
      .from('job_descriptions')
      .select('id, extracted_job_title, extracted_role_type, extracted_company, extracted_phrases, extracted_themes, extracted_criteria, match_report, match_report_profile_id, source_url')
      .eq('user_id', user!.id)
      .not('extracted_criteria', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('generated_resumes')
      .select('ats_score')
      .eq('user_id', user!.id)
      .not('ats_score', 'is', null)
      .is('deleted_at', null),
    supabase
      .from('users')
      .select('plan, tier, is_admin')
      .eq('id', user!.id)
      .single(),
    supabase
      .from('usage_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user!.id)
      .eq('action', 'generate_resume')
      .gte('created_at', monthStart.toISOString()),
    supabase
      .from('user_profiles')
      .select('id, name')
      .eq('id', activeProfileId)
      .single(),
    supabase
      .from('resumes')
      .select('filename, created_at')
      .eq('user_id', user!.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('job_experiences')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user!.id),
  ]);

  const displayName = user?.user_metadata?.full_name?.split(' ')[0]
    ?? user?.email?.split('@')[0]
    ?? 'there';

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const scoredResumes = (scoreRows ?? []) as Array<{ ats_score: number }>
  const avgScore = scoredResumes.length > 0
    ? Math.round(scoredResumes.reduce((sum, r) => sum + r.ats_score, 0) / scoredResumes.length)
    : null;

  type ModuleRecord = { id: string; title: string; weight?: string; themes?: string[]; type?: string; dimensions?: string[] };
  const typedModules: ModuleRecord[] = (modules ?? []) as ModuleRecord[];
  const typedResumes = resumes ?? [];
  const typedJds = (jds ?? []) as Array<{ id: string; extracted_role_type?: string; extracted_company?: string; created_at: string }>;
  const hasContent = typedModules.length > 0 || typedResumes.length > 0;

  const latestJd = recentJdFull as {
    id: string;
    extracted_job_title: string | null;
    extracted_role_type: string | null;
    extracted_company: string | null;
    extracted_phrases: string[] | null;
    extracted_themes: string[] | null;
    match_report: MatchReportData | null;
    match_report_profile_id: string | null;
    source_url: string | null;
  } | null;

  // "Next move" — determine the primary action to surface
  type NextMove =
    | { type: 'upload' }
    | { type: 'paste_jd' }
    | { type: 'generate'; company: string | null; role: string | null }
    | { type: 'improve'; score: number; company: string | null; topGap: string | null };

  let nextMove: NextMove;
  if (typedModules.length === 0) {
    nextMove = { type: 'upload' };
  } else if ((jdCount ?? 0) === 0) {
    nextMove = { type: 'paste_jd' };
  } else if ((resumeCount ?? 0) === 0) {
    nextMove = {
      type: 'generate',
      company: latestJd?.extracted_company ?? null,
      role: latestJd?.extracted_role_type ?? null,
    };
  } else {
    const moduleThemes = new Set(typedModules.flatMap(m => m.themes ?? []));
    const jdThemes = latestJd?.extracted_themes ?? [];
    const gaps = jdThemes.filter(t => !moduleThemes.has(t));
    nextMove = {
      type: 'improve',
      score: avgScore ?? 0,
      company: latestJd?.extracted_company ?? null,
      topGap: gaps[0] ?? null,
    };
  }

  // Plan gate state
  const plan = (profileRow?.plan ?? 'free') as string;
  const tier = (profileRow?.tier ?? 'free') as string;
  const isAdmin = profileRow?.is_admin ?? false;
  const currentModuleCount = moduleCount ?? 0;
  const resumesThisMonth = resumesThisMonthCount ?? 0;

  const moduleCap = moduleLimit(tier);
  const resumeCap = isProTier(tier) ? Infinity : FREE_MONTHLY_GENERATIONS;

  const nearModuleLimit = !isAdmin && Number.isFinite(moduleCap) && currentModuleCount >= moduleCap - 2;
  const atModuleLimit = !isAdmin && Number.isFinite(moduleCap) && currentModuleCount >= moduleCap;
  const nearResumeLimit = !isAdmin && Number.isFinite(resumeCap) && resumesThisMonth >= resumeCap - 1;
  const atResumeLimit = !isAdmin && Number.isFinite(resumeCap) && resumesThisMonth >= resumeCap;

  // ─── Resume breakdown (Part B) ───
  const anyTagged = typedModules.some(m => (m.dimensions ?? []).length > 0);
  const breakdown = DIMENSIONS.map((dim: Dimension) => {
    const inDim = typedModules.filter(m => (m.dimensions ?? []).includes(dim));
    const weighted = inDim.reduce((sum, m) => sum + (m.weight === 'anchor' || m.weight === 'strong' ? 1.5 : 1), 0);
    return {
      dim,
      count: inDim.length,
      strength: strengthFromCount(Math.round(weighted)),
      modules: inDim.slice(0, 5).map(m => ({ id: m.id, title: m.title })),
    };
  });

  const preferences = (onboardingProfile?.preferences ?? {}) as { target_roles?: string[]; career_level?: string };
  const targetRole = preferences.target_roles?.[0] ?? null;
  const careerLevelLabel: Record<string, string> = { mid: 'Mid-level', senior: 'Senior', executive: 'Executive' };
  const targetLevel = preferences.career_level ? (careerLevelLabel[preferences.career_level] ?? preferences.career_level) : null;

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
            ⚠️ You&apos;re using {currentModuleCount}/{moduleCap} modules on the {plan} plan.
            <Link href="/billing">Upgrade →</Link>
          </div>
        )}
        {nearResumeLimit && !atResumeLimit && (
          <div className="plan-warning-banner">
            ⚠️ You&apos;ve used {resumesThisMonth}/{resumeCap} resume generations this month.
            <Link href="/billing">Upgrade →</Link>
          </div>
        )}

        {!hasContent ? (
          <div className="section-card">
            <div style={{ padding: '40px 32px' }}>
              <div style={{ textAlign: 'center', marginBottom: 36 }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🧩</div>
                <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 8 }}>
                  Welcome to ModuleHire
                </div>
                <div style={{ fontSize: 13, color: 'var(--text2)', maxWidth: 400, margin: '0 auto' }}>
                  Three steps to your first tailored resume. Takes about 5 minutes.
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, maxWidth: 680, margin: '0 auto 32px' }}>
                {[
                  { step: '1', icon: '📤', title: 'Upload your resume', desc: 'We\'ll parse it into skill blocks called modules.', href: '/upload', cta: 'Upload resume', color: 'var(--teal)' },
                  { step: '2', icon: '🔍', title: 'Paste a job description', desc: 'We match your modules to the role and rank them.', href: '/generate', cta: 'Find matches', color: 'var(--amber)' },
                  { step: '3', icon: '⚡', title: 'Generate your resume', desc: 'Tailored, keyword-matched, ready to download.', href: '/generate', cta: 'Generate', color: 'var(--indigo)' },
                ].map(s => (
                  <div key={s.step} style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 12, padding: '20px 18px', textAlign: 'center' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: s.color + '22', border: `1.5px solid ${s.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, margin: '0 auto 12px' }}>
                      {s.icon}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: s.color, letterSpacing: '0.06em', marginBottom: 6, fontFamily: 'var(--mono)' }}>STEP {s.step}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{s.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5, marginBottom: 14 }}>{s.desc}</div>
                    <Link href={s.href} className="btn-ghost" style={{ fontSize: 12, textDecoration: 'none', display: 'inline-block' }}>{s.cta} →</Link>
                  </div>
                ))}
              </div>

              <div style={{ textAlign: 'center' }}>
                <Link href="/upload" className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                  <IconUpload /> Upload your first resume
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="dash-two-col-b">
            {/* ── LEFT COLUMN ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Resume card */}
              <div className="section-card" style={{ padding: '16px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 10, minWidth: 0 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--teal-dim)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <IconFiles />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{activeProfile?.name ?? 'Default profile'}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {latestResume?.filename ?? 'No resume uploaded'}
                      </div>
                    </div>
                  </div>
                  <DashboardProfileSwitch activeProfileId={activeProfileId} />
                </div>
              </div>

              {/* What you're targeting */}
              <div className="section-card" style={{ padding: '16px 18px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10 }}>
                  What you&apos;re targeting
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    { label: 'Role', value: targetRole },
                    { label: 'Level', value: targetLevel },
                    { label: 'Location', value: onboardingProfile?.location ?? null },
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                      <span style={{ color: 'var(--text3)' }}>{row.label}</span>
                      <span style={{ color: row.value ? 'var(--text)' : 'var(--text3)', fontStyle: row.value ? 'normal' : 'italic' }}>{row.value ?? 'Not set'}</span>
                    </div>
                  ))}
                </div>
                <Link href="/preferences" style={{ display: 'inline-block', marginTop: 10, fontSize: 12, color: 'var(--teal)', textDecoration: 'none' }}>
                  Edit targets →
                </Link>
              </div>

              {/* Resume breakdown */}
              <div className="section-card" style={{ padding: '16px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Resume breakdown</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Strength</span>
                </div>
                {!anyTagged && typedModules.length > 0 ? (
                  <div style={{ fontSize: 12.5, color: 'var(--text3)', padding: '8px 0' }}>
                    Breakdown will appear after your library is analyzed.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {breakdown.map(row => (
                      <DashboardBreakdownRow
                        key={row.dim}
                        dim={row.dim}
                        label={DIMENSION_LABELS[row.dim]}
                        count={row.count}
                        strength={row.strength}
                        modules={row.modules}
                      />
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)' }}>
                    <IconCheck /> {moduleCount ?? 0} modules in library
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)' }}>
                    <IconCheck /> {jobExperienceCount ?? 0} jobs in work history
                  </div>
                </div>
              </div>
            </div>

            {/* ── RIGHT COLUMN ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
              {/* Next step */}
              <div className="section-card" style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '20px 24px' }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, flexShrink: 0, background: 'rgba(29,158,117,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {nextMove.type === 'upload' ? <IconUploadLarge /> : nextMove.type === 'paste_jd' ? <IconSearchLarge /> : <IconBolt />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: 'var(--teal)', letterSpacing: '0.06em', marginBottom: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--teal)' }} /> NEXT STEP
                  </div>
                  {nextMove.type === 'upload' && <>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Upload your resume to get started</div>
                    <div style={{ fontSize: 13, color: 'var(--text3)' }}>We&apos;ll parse it into skill modules you can mix and match for any role.</div>
                  </>}
                  {nextMove.type === 'paste_jd' && <>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Paste a job description to find your best modules</div>
                    <div style={{ fontSize: 13, color: 'var(--text3)' }}>We&apos;ll rank your {moduleCount} modules against the role and show what fits.</div>
                  </>}
                  {nextMove.type === 'generate' && <>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                      Generate your first resume{nextMove.company ? ` for ${nextMove.company}` : ''}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text3)' }}>
                      You&apos;ve analyzed{nextMove.role ? ` the ${nextMove.role} role` : ' a role'} — now build the resume.
                    </div>
                  </>}
                  {nextMove.type === 'improve' && <>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                      {nextMove.company ? `Your ${nextMove.company} resume scores ${nextMove.score}` : `Your latest resume scores ${nextMove.score}`}
                      {nextMove.topGap ? ` — missing "${nextMove.topGap}"` : ' — you\'re in good shape'}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text3)' }}>
                      {nextMove.topGap ? `Adding a module covering "${nextMove.topGap}" could push your score higher.` : 'Add more job descriptions to keep your modules aligned to new roles.'}
                    </div>
                  </>}
                  <Link
                    href={nextMove.type === 'upload' ? '/upload' : nextMove.type === 'improve' ? '/library' : '/generate'}
                    style={{ display: 'inline-block', marginTop: 10, fontSize: 12.5, fontWeight: 600, color: 'var(--teal)', textDecoration: 'none' }}
                  >
                    {nextMove.type === 'upload' ? 'Upload resume →'
                      : nextMove.type === 'paste_jd' ? 'Find matches →'
                      : nextMove.type === 'generate' ? 'Generate resume →'
                      : nextMove.topGap ? 'Add a module →'
                      : 'Add a job description →'}
                  </Link>
                </div>
              </div>

              {/* Latest match */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Latest match</span>
                  {latestJd && <Link href={`/matches/${latestJd.id}`} style={{ fontSize: 12, color: 'var(--teal)', textDecoration: 'none' }}>Open full report →</Link>}
                </div>
                {latestJd ? (
                  <MatchReport
                    variant="compact"
                    report={latestJd.match_report_profile_id === activeProfileId ? latestJd.match_report : null}
                    jd={{
                      title: latestJd.extracted_job_title || latestJd.extracted_role_type || 'This role',
                      company: latestJd.extracted_company ?? null,
                    }}
                  />
                ) : (
                  <div className="section-card" style={{ padding: '20px 18px', fontSize: 13, color: 'var(--text3)' }}>
                    <Link href="/generate" style={{ color: 'var(--teal)', textDecoration: 'none' }}>Paste a job description to see how you match →</Link>
                  </div>
                )}
              </div>

              {/* Recent resumes */}
              {typedResumes.length > 0 && (
                <div className="section-card">
                  <div className="section-head">
                    <div className="section-head-title"><IconFiles /> Recent Resumes</div>
                    <Link href="/resumes" className="section-head-action">View all →</Link>
                  </div>
                  {(typedResumes as Array<{
                    id: string; title?: string; created_at: string; ats_score?: number | null
                    job_descriptions?: { extracted_company: string | null; extracted_role_type: string | null; extracted_job_title: string | null } | { extracted_company: string | null; extracted_role_type: string | null; extracted_job_title: string | null }[] | null
                  }>).map((r) => {
                    const jd = Array.isArray(r.job_descriptions) ? r.job_descriptions[0] : r.job_descriptions
                    const jdLabel = jd ? [jd.extracted_company, jd.extracted_job_title || jd.extracted_role_type].filter(Boolean).join(' · ') : ''
                    return (
                      <Link href={`/resumes/${r.id}`} className="app-row" key={r.id} style={{ textDecoration: 'none' }}>
                        <div className="app-row-title">{r.title || 'Untitled resume'}</div>
                        <div className="app-row-co">{jdLabel}</div>
                        <div className="app-row-date">{new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                        {typeof r.ats_score === 'number' && (
                          <div className="app-badge sent">{r.ats_score}</div>
                        )}
                        <span style={{ color: 'var(--text3)', fontSize: 12 }}>›</span>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* JOB DESCRIPTIONS */}
        {typedJds.length > 0 && (
          <div className="section-card" style={{ marginTop: 16 }}>
            <div className="section-head">
              <div className="section-head-title"><IconBriefcase /> Recent Job Descriptions</div>
              <Link href="/generate" className="section-head-action">New match →</Link>
            </div>
            {typedJds.map(jd => (
              <div className="job-item" key={jd.id}>
                <div className="job-co-logo">{(jd.extracted_company ?? 'JD').slice(0, 3).toUpperCase()}</div>
                <div className="job-info">
                  <div className="job-title">{jd.extracted_role_type || 'Untitled role'}</div>
                  <div className="job-company">{jd.extracted_company || 'Unknown company'}</div>
                </div>
                <div className="job-right">
                  <Link href="/generate" className="generate-btn">Generate ↗</Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* MODULE LIBRARY QUICK LINK */}
        {hasContent && (
          <div className="section-card" style={{ marginTop: 16 }}>
            <div className="section-head">
              <div className="section-head-title"><IconBlocks /> My Modules</div>
              <Link href="/library" className="section-head-action">Manage →</Link>
            </div>
            <div style={{ padding: '14px 20px', fontSize: 12.5, color: 'var(--text3)' }}>
              {moduleCount ?? 0} modules in your library — edit, add, or organize them in the library.
            </div>
          </div>
        )}
      </div>
    </>
  );
}
