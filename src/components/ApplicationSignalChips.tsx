'use client'

import { APPLICATION_SOURCES, POSTING_AGES, type ApplicationSource, type PostingAge } from '@/lib/tracker'

// "Where are you applying?" + "How old is the posting?" — two optional one-tap chip rows,
// shared by the tracker add/edit form and the "Add to tracker" card on /generate.

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        fontSize: 11.5, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'var(--font)',
        border: `1px solid ${active ? 'var(--teal)' : 'var(--border2)'}`,
        background: active ? 'var(--teal-dim)' : 'transparent',
        color: active ? 'var(--teal)' : 'var(--text2)',
      }}
    >
      {children}
    </button>
  )
}

export default function ApplicationSignalChips({
  source,
  postingAge,
  onSourceChange,
  onPostingAgeChange,
  postingAgeDetected = false,
}: {
  source: ApplicationSource | null
  postingAge: PostingAge | null
  onSourceChange: (v: ApplicationSource | null) => void
  onPostingAgeChange: (v: PostingAge | null) => void
  /** True when postingAge was pre-filled from "Posted N days ago" in the pasted JD. */
  postingAgeDetected?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div className="form-label" style={{ marginBottom: 6 }}>Where are you applying?</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {APPLICATION_SOURCES.filter(s => s.value !== 'other').map(s => (
            <Chip key={s.value} active={source === s.value} onClick={() => onSourceChange(source === s.value ? null : s.value)}>
              {s.label}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <div className="form-label" style={{ marginBottom: 6 }}>
          How old is the posting? <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--text3)' }}>(optional{postingAgeDetected && postingAge ? ' · from the posting' : ''})</span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {POSTING_AGES.map(a => (
            <Chip key={a.value} active={postingAge === a.value} onClick={() => onPostingAgeChange(postingAge === a.value ? null : a.value)}>
              {a.label}
            </Chip>
          ))}
          <Chip active={postingAge === null} onClick={() => onPostingAgeChange(null)}>Not sure</Chip>
        </div>
      </div>
    </div>
  )
}
