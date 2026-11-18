'use client'

import { useMemo, useState } from 'react'
import {
  DEMO_APPLICANTS, DEMO_CRITERIA, hasDealbreakerMiss, overallScore,
  type DemoApplicant, type DemoWeight,
} from './demo-data'

// Same thresholds as the real workspace (business/jobs/[id]/page.tsx).
function scoreColor(score: number) {
  if (score >= 80) return '#1d9e75'
  if (score >= 60) return '#f59e0b'
  return '#ef4444'
}

const WEIGHT_STYLE: Record<DemoWeight, { label: string; color: string; bg: string }> = {
  dealbreaker: { label: 'Dealbreaker', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  must_have: { label: 'Must have', color: 'var(--teal)', bg: 'var(--teal-dim)' },
  nice_to_have: { label: 'Nice to have', color: 'var(--text2)', bg: 'var(--bg3)' },
}

const STATUS_COLOR: Record<DemoApplicant['status'], string> = {
  New: 'var(--text3)',
  Shortlisted: 'var(--teal)',
  Interviewing: '#1d9e75',
  Rejected: '#ef4444',
}

function WeightChip({ weight }: { weight: DemoWeight }) {
  const w = WEIGHT_STYLE[weight]
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 700, color: w.color, background: w.bg,
      padding: '2px 7px', borderRadius: 5, whiteSpace: 'nowrap',
    }}>
      {w.label}
    </span>
  )
}

const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
}

export default function DemoWorkspace() {
  const ranked = useMemo(
    () => [...DEMO_APPLICANTS].map((a) => ({ a, score: overallScore(a) })).sort((x, y) => y.score - x.score),
    [],
  )
  const [selectedId, setSelectedId] = useState(ranked[0].a.id)
  const selected = ranked.find((r) => r.a.id === selectedId) ?? ranked[0]

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
      {/* Left: criteria + ranked list */}
      <div style={{ flex: '1 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <section style={{ ...card, padding: '16px 18px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 4 }}>
            Scoring criteria
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12, lineHeight: 1.5 }}>
            Extracted from the job description, then adjusted by the hiring manager.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {DEMO_CRITERIA.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 13, color: 'var(--text)' }}>
                  {c.label}
                  {c.minYears ? <span style={{ color: 'var(--text3)' }}> · min {c.minYears} yrs</span> : null}
                </span>
                <WeightChip weight={c.weight} />
              </div>
            ))}
          </div>
        </section>

        <section style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, color: 'var(--text2)' }}>
            {ranked.length} applicants, ranked
          </div>
          {ranked.map(({ a, score }, i) => {
            const active = a.id === selected.a.id
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setSelectedId(a.id)}
                aria-pressed={active}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left',
                  padding: '12px 18px', border: 'none', cursor: 'pointer',
                  borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                  background: active ? 'var(--teal-dim)' : 'transparent',
                  font: 'inherit', color: 'inherit',
                }}
              >
                <div style={{ fontSize: 12, color: 'var(--text3)', width: 16, fontFamily: 'var(--mono)' }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{a.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.headline}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: scoreColor(score), letterSpacing: '-0.03em', lineHeight: 1 }}>{score}</div>
                  <div style={{ fontSize: 10.5, color: STATUS_COLOR[a.status], fontWeight: 600, marginTop: 3 }}>{a.status}</div>
                </div>
              </button>
            )
          })}
        </section>
      </div>

      {/* Right: detail */}
      <section style={{ ...card, flex: '1.3 1 420px', minWidth: 0, padding: '20px 22px' }} aria-live="polite">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>{selected.a.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 3 }}>{selected.a.headline}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 34, fontWeight: 900, color: scoreColor(selected.score), letterSpacing: '-0.04em', lineHeight: 1 }}>
              {selected.score}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>overall, out of 100</div>
          </div>
        </div>

        {hasDealbreakerMiss(selected.a) && (
          <div style={{
            fontSize: 12.5, color: '#ef4444', background: 'rgba(239,68,68,0.10)',
            border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '9px 12px', marginBottom: 14, lineHeight: 1.5,
          }}>
            Misses a dealbreaker, so the overall score is capped at 25 no matter how strong the rest is.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {DEMO_CRITERIA.map((c) => {
            const s = selected.a.scores.find((x) => x.criterionId === c.id)
            if (!s) return null
            return (
              <div key={c.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', background: 'var(--bg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', flex: 1, minWidth: 160 }}>{c.label}</span>
                  <WeightChip weight={c.weight} />
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: s.met ? '#1d9e75' : '#ef4444' }}>
                    {s.met ? '✓ Met' : '✗ Not met'}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: scoreColor(s.score), width: 32, textAlign: 'right' }}>{s.score}</span>
                </div>
                <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden', marginBottom: 8 }}>
                  <div style={{ width: `${s.score}%`, height: '100%', background: scoreColor(s.score) }} />
                </div>
                <div style={{ fontSize: 12.5, color: s.evidence === 'not found in resume' ? 'var(--text3)' : 'var(--text2)', lineHeight: 1.55, fontStyle: s.evidence.startsWith('"') ? 'normal' : 'italic' }}>
                  {s.evidence}
                </div>
              </div>
            )
          })}
        </div>

        <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 16, lineHeight: 1.6 }}>
          Weighting: dealbreakers count 3x, must-haves 2x, nice-to-haves 1x. In the real workspace you can
          rescore, add notes and move applicants through your pipeline.
        </p>
      </section>
    </div>
  )
}
