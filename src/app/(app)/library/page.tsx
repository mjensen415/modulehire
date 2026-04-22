import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

type ModuleRecord = {
  id: string
  title: string
  weight?: string | null
  themes?: string[] | null
  role_types?: string[] | null
  type?: string | null
  source_company?: string | null
}

function getModuleColor(m: ModuleRecord): string {
  if (m.weight === 'anchor') return 'c-teal'
  if (m.weight === 'strong') return 'c-indigo'
  const themeMap: Record<string, string> = {
    'community-building': 'c-teal',
    'developer-relations': 'c-indigo',
    'leadership': 'c-amber',
    'content-strategy': 'c-rose',
    'data-driven': 'c-green',
    'growth': 'c-green',
    'events': 'c-amber',
  }
  for (const t of m.themes ?? []) {
    if (themeMap[t]) return themeMap[t]
  }
  return 'c-amber'
}

function getModuleDomain(m: ModuleRecord): string {
  for (const r of m.role_types ?? []) {
    if (r.includes('community')) return 'Community'
    if (r.includes('developer') || r.includes('devrel')) return 'DevRel'
    if (r.includes('content')) return 'Content'
    if (r.includes('ops')) return 'Operations'
    if (r.includes('marketing')) return 'Marketing'
  }
  for (const t of m.themes ?? []) {
    if (t.includes('leadership') || t.includes('executive')) return 'Leadership'
    if (t.includes('content')) return 'Content'
    if (t.includes('data')) return 'Analytics'
    if (t.includes('events')) return 'Events'
    if (t.includes('partner')) return 'Partnerships'
    if (t.includes('brand')) return 'Brand'
  }
  if (m.type === 'positioning') return 'Positioning'
  if (m.type === 'skill') return 'Skill'
  return 'Experience'
}

function StrengthPips({ weight }: { weight?: string | null }) {
  const filled = weight === 'anchor' ? 5 : weight === 'strong' ? 3 : 2
  return (
    <div className="mod-chip-pips">
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} className={`pip${i < filled ? ' on' : ''}`} />
      ))}
    </div>
  )
}

function IconPlus() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function IconBlocks() {
  return (
    <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
      <path d="M1.5 4.5h12M1.5 7.5h8M1.5 10.5h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <rect x="10" y="6.5" width="4.5" height="4.5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  )
}

function IconEdit() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M7 1.5L9.5 4L3.5 10H1v-2.5L7 1.5z"/>
    </svg>
  )
}

type PageProps = {
  searchParams: Promise<{ q?: string; weight?: string; theme?: string }>
}

export default async function Library({ searchParams }: PageProps) {
  const { q, weight, theme } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('modules')
    .select('id, title, weight, themes, role_types, type, source_company', { count: 'exact' })
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (weight) query = query.eq('weight', weight)
  if (theme) query = query.contains('themes', [theme])
  if (q) query = query.ilike('title', `%${q}%`)

  const { data: modules, count } = await query.limit(60)

  const { data: allResumes } = await supabase
    .from('generated_resumes')
    .select('module_ids_used')
    .not('module_ids_used', 'is', null)

  const usageCounts: Record<string, number> = {}
  for (const r of allResumes ?? []) {
    for (const mid of (r.module_ids_used as string[] | null) ?? []) {
      usageCounts[mid] = (usageCounts[mid] ?? 0) + 1
    }
  }

  const typedModules: ModuleRecord[] = (modules ?? []) as ModuleRecord[]

  const allThemes: string[] = Array.from(
    new Set(typedModules.flatMap(m => m.themes ?? []))
  ).sort()

  return (
    <>
      <div className="app-topbar">
        <div>
          <span className="topbar-title">My Modules</span>
          <span className="topbar-sub">— {count ?? 0} in your library</span>
        </div>
        <div className="topbar-actions">
          <Link href="/upload" className="btn-ghost">Upload resume</Link>
          <Link href="/generate" className="btn-primary">
            <IconPlus /> Generate resume
          </Link>
        </div>
      </div>

      <div className="dash-content">
        {/* Filter bar */}
        <form method="GET" style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            name="q"
            type="search"
            defaultValue={q ?? ''}
            placeholder="Search modules…"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border2)',
              borderRadius: 8,
              padding: '8px 14px',
              fontSize: 13,
              fontFamily: 'var(--font)',
              color: 'var(--text)',
              outline: 'none',
              width: 200,
            }}
          />
          <select
            name="weight"
            defaultValue={weight ?? ''}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border2)',
              borderRadius: 8,
              padding: '8px 14px',
              fontSize: 13,
              fontFamily: 'var(--font)',
              color: weight ? 'var(--text)' : 'var(--text3)',
              outline: 'none',
            }}
          >
            <option value="">All weights</option>
            <option value="anchor">Anchor</option>
            <option value="strong">Strong</option>
            <option value="supporting">Supporting</option>
          </select>
          {allThemes.length > 0 && (
            <select
              name="theme"
              defaultValue={theme ?? ''}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border2)',
                borderRadius: 8,
                padding: '8px 14px',
                fontSize: 13,
                fontFamily: 'var(--font)',
                color: theme ? 'var(--text)' : 'var(--text3)',
                outline: 'none',
              }}
            >
              <option value="">All themes</option>
              {allThemes.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          )}
          <button
            type="submit"
            className="btn-ghost"
            style={{ fontSize: 13 }}
          >
            Filter
          </button>
          {(q || weight || theme) && (
            <Link href="/library" style={{ fontSize: 12, color: 'var(--text3)', textDecoration: 'none' }}>
              Clear ×
            </Link>
          )}
        </form>

        {typedModules.length === 0 ? (
          <div className="section-card">
            <div style={{ padding: '56px 32px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🧩</div>
              <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 8 }}>
                {q || weight || theme ? 'No modules match your filters' : 'No modules yet'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 24, maxWidth: 320, margin: '0 auto 24px' }}>
                {q || weight || theme
                  ? 'Try adjusting your search or filters.'
                  : 'Upload a resume and ModuleHire will parse it into modular skill blocks.'}
              </div>
              {!(q || weight || theme) && (
                <Link href="/upload" className="btn-primary" style={{ display: 'inline-flex' }}>
                  Upload resume
                </Link>
              )}
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 12,
            }}
          >
            {typedModules.map(m => {
              const color = getModuleColor(m)
              const domain = getModuleDomain(m)
              const usedIn = usageCounts[m.id] ?? 0
              return (
                <div key={m.id} className={`mod-chip ${color}`} style={{ position: 'relative' }}>
                  <div className="mod-chip-bar" />
                  <div className="mod-chip-domain">{domain}</div>
                  <div className="mod-chip-name">{m.title || 'Untitled'}</div>
                  <div className="mod-chip-meta">
                    <span className="mod-chip-count">
                      {(m.themes ?? []).length} themes
                      {usedIn > 0 && ` · used in ${usedIn}`}
                    </span>
                    <StrengthPips weight={m.weight} />
                  </div>
                  {m.source_company && (
                    <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 6 }}>
                      {m.source_company}
                    </div>
                  )}
                  <Link
                    href={`/library/${m.id}`}
                    style={{
                      position: 'absolute',
                      top: 10,
                      right: 10,
                      width: 22,
                      height: 22,
                      background: 'var(--surface2)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text3)',
                      textDecoration: 'none',
                      opacity: 0.7,
                    }}
                    title="Edit module"
                  >
                    <IconEdit />
                  </Link>
                </div>
              )
            })}
          </div>
        )}

        {typedModules.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div className="section-card">
              <div className="section-head">
                <div className="section-head-title">
                  <IconBlocks /> Summary
                </div>
              </div>
              <div style={{ padding: '12px 16px', display: 'flex', gap: 32 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 4 }}>TOTAL</div>
                  <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>{count ?? 0}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 4 }}>ANCHORS</div>
                  <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--teal)' }}>
                    {typedModules.filter(m => m.weight === 'anchor').length}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 4 }}>STRONG</div>
                  <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--indigo)' }}>
                    {typedModules.filter(m => m.weight === 'strong').length}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 4 }}>USED IN RESUMES</div>
                  <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--green)' }}>
                    {typedModules.filter(m => usageCounts[m.id]).length}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
