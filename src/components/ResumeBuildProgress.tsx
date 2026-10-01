'use client'

import { useEffect, useRef, useState } from 'react'
import { DIMENSIONS, DIMENSION_LABELS, isDimension } from '@/lib/dimensions'
import { streamParseResume, type ParseStreamRole, type ParseStreamEvent } from '@/lib/parseResumeStream'

type RoleState = {
  role: ParseStreamRole
  status: 'pending' | 'running' | 'done' | 'failed'
  modules: Array<{ id: string; title: string; dimensions: string[] }>
}

export type ResumeBuildResult = {
  module_count: number
  modules: unknown[]
  contact: Record<string, unknown> | null
  resume_id: string
  profile_updated?: boolean
  job_experience_ids?: string[]
}

export default function ResumeBuildProgress({
  resumeId,
  rawText,
  onDone,
  onError,
}: {
  resumeId: string
  rawText: string
  onDone: (result: ResumeBuildResult) => void
  onError: (message: string) => void
}) {
  const [roles, setRoles] = useState<RoleState[]>([])
  const [hasExtras, setHasExtras] = useState(false)
  const [extrasDone, setExtrasDone] = useState<'pending' | 'done' | 'failed'>('pending')
  const [outlineArrived, setOutlineArrived] = useState(false)
  const [totalModules, setTotalModules] = useState(0)
  const [dimensionCounts, setDimensionCounts] = useState<Record<string, number>>({})
  const [finished, setFinished] = useState(false)
  const startedRef = useRef(false)
  const doneResultRef = useRef<ResumeBuildResult | null>(null)
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    function handleEvent(event: ParseStreamEvent) {
      if (event.type === 'outline') {
        setOutlineArrived(true)
        setHasExtras(event.extras)
        setRoles(event.roles.map(role => ({ role, status: 'running', modules: [] })))
      } else if (event.type === 'role_done') {
        if (event.index === -1) {
          setExtrasDone('done')
        } else {
          setRoles(prev => prev.map(r => r.role.index === event.index ? { ...r, status: 'done', modules: event.modules } : r))
        }
        setTotalModules(t => t + event.modules.length)
        setDimensionCounts(prev => {
          const next = { ...prev }
          for (const m of event.modules) {
            for (const d of m.dimensions) {
              if (isDimension(d)) next[d] = (next[d] ?? 0) + 1
            }
          }
          return next
        })
      } else if (event.type === 'role_failed') {
        if (event.index === -1) setExtrasDone('failed')
        else setRoles(prev => prev.map(r => r.role.index === event.index ? { ...r, status: 'failed' } : r))
      } else if (event.type === 'done') {
        setFinished(true)
        const result: ResumeBuildResult = {
          module_count: event.module_count,
          modules: event.modules,
          contact: event.contact,
          resume_id: event.resume_id,
          profile_updated: event.profile_updated,
          job_experience_ids: event.job_experience_ids,
        }
        doneResultRef.current = result
        autoAdvanceTimerRef.current = setTimeout(() => onDone(result), 2500)
      } else if (event.type === 'error') {
        onError("We couldn't read your resume clearly.")
      }
    }

    streamParseResume(resumeId, rawText, handleEvent).catch(err => onError((err as Error).message))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const runningRole = roles.find(r => r.status === 'running')
  const totalTasks = roles.length + (hasExtras ? 1 : 0)
  const completedTasks = roles.filter(r => r.status === 'done' || r.status === 'failed').length + (extrasDone !== 'pending' ? 1 : 0)
  const progressPct = finished ? 100 : !outlineArrived ? 8 : Math.min(96, 8 + Math.round((completedTasks / Math.max(1, totalTasks)) * 92))

  const header = finished
    ? `${totalModules} module${totalModules === 1 ? '' : 's'} ready`
    : !outlineArrived
      ? 'Reading your resume…'
      : runningRole
        ? `Building modules from ${runningRole.role.company}…`
        : roles.length > 0
          ? `Found ${roles.length} role${roles.length === 1 ? '' : 's'}`
          : 'Building your modules…'

  const transition = reducedMotion ? 'opacity 0.2s' : 'all 0.4s ease'

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 0' }}>
      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{header}</div>
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>{totalModules} module{totalModules === 1 ? '' : 's'} found</div>
      </div>

      <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden', marginBottom: 32 }}>
        <div style={{ height: '100%', width: `${progressPct}%`, background: 'var(--teal)', borderRadius: 2, transition: reducedMotion ? 'none' : 'width 0.4s ease' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: roles.length > 0 ? '1fr 240px' : '1fr', gap: 24 }} className="resume-build-grid">
        {/* Career timeline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!outlineArrived && (
            <div style={{ height: 70, borderRadius: 10, background: 'var(--bg3)', opacity: 0.5 }} />
          )}
          {roles.map((r, i) => (
            <div
              key={r.role.index}
              style={{
                borderTop: `1px solid ${r.status === 'running' ? 'var(--teal-glow)' : 'var(--border)'}`,
                borderRight: `1px solid ${r.status === 'running' ? 'var(--teal-glow)' : 'var(--border)'}`,
                borderBottom: `1px solid ${r.status === 'running' ? 'var(--teal-glow)' : 'var(--border)'}`,
                borderLeft: `3px solid ${r.status === 'running' ? 'var(--teal)' : r.status === 'failed' ? 'var(--rose)' : r.status === 'done' ? 'var(--teal)' : 'var(--border2)'}`,
                borderRadius: 10, padding: '12px 14px', background: 'var(--surface)',
                opacity: reducedMotion ? 1 : undefined,
                animation: reducedMotion ? undefined : 'mh-card-in 0.3s ease both',
                animationDelay: reducedMotion ? undefined : `${i * 80}ms`,
                transition,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--teal-dim)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono)',
                }}>
                  {r.role.company.trim().charAt(0).toUpperCase() || '?'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{r.role.title || 'Untitled role'}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>
                    {r.role.company}{r.role.date_start ? ` · ${r.role.date_start} – ${r.role.date_end ?? 'present'}` : ''}
                  </div>
                </div>
                {r.status === 'done' && (
                  <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--teal)', fontWeight: 700, flexShrink: 0 }}>+{r.modules.length}</span>
                )}
              </div>
              {r.status === 'running' && (
                <div style={{ marginTop: 8, height: 10, borderRadius: 4, background: 'var(--bg3)', animation: reducedMotion ? undefined : 'mh-shimmer 1.4s ease-in-out infinite' }} />
              )}
              {r.status === 'failed' && (
                <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--text3)', fontStyle: 'italic' }}>
                  Couldn&apos;t read this one — you can add it manually next.
                </div>
              )}
              {r.status === 'done' && r.modules.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                  {r.modules.slice(0, 4).map(m => (
                    <span key={m.id} style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 10, background: 'var(--bg3)', color: 'var(--text2)' }}>{m.title}</span>
                  ))}
                  {r.modules.length > 4 && (
                    <span style={{ fontSize: 10.5, padding: '2px 8px', color: 'var(--text3)' }}>+{r.modules.length - 4} more</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Live breakdown */}
        {roles.length > 0 && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', background: 'var(--surface)', alignSelf: 'start' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10 }}>
              Resume breakdown
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {DIMENSIONS.map(dim => {
                const count = dimensionCounts[dim] ?? 0
                const strength = count === 0 ? 0 : count <= 2 ? 1 : count <= 5 ? 2 : count <= 10 ? 3 : count <= 20 ? 4 : 5
                return (
                  <div key={dim} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                    <span style={{ color: 'var(--text2)' }}>{DIMENSION_LABELS[dim]}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1 }}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <span key={n} style={{ color: n <= strength ? 'var(--text)' : 'var(--border2)' }}>●</span>
                      ))}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {finished && (
        <div style={{ textAlign: 'center', marginTop: 24, animation: reducedMotion ? undefined : 'mh-card-in 0.3s ease both' }}>
          <button
            type="button"
            className="btn-primary"
            style={{ display: 'inline-flex' }}
            onClick={() => {
              if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current)
              if (doneResultRef.current) onDone(doneResultRef.current)
            }}
          >
            Review your modules →
          </button>
        </div>
      )}

      <style>{`
        @keyframes mh-shimmer { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.7; } }
        @keyframes mh-card-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @media (max-width: 640px) { .resume-build-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </div>
  )
}
