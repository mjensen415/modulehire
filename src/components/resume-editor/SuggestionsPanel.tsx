'use client'

import type { BlockSuggestion } from '@/lib/resume-doc'

type Props = {
  suggestions: BlockSuggestion[] | null
  loading: boolean
  error: string | null
  isStale: (s: BlockSuggestion) => boolean
  onFind: () => void
  onAccept: (s: BlockSuggestion) => void
  onDismiss: (s: BlockSuggestion) => void
  onShow: (s: BlockSuggestion) => void
}

// Suggested edits as operations on resume lines. Accepting one applies it through the editor's
// own history, so ⌘Z undoes a suggestion exactly like typing.
export default function SuggestionsPanel({ suggestions, loading, error, isStale, onFind, onAccept, onDismiss, onShow }: Props) {
  return (
    <div>
      <div className="rd-fit-head">
        <div>
          <div className="rd-fit-label">Suggested edits</div>
          <div className="rd-fit-sub">For requirements your resume doesn&apos;t show yet, using only what your modules say.</div>
        </div>
      </div>
      {suggestions === null || suggestions.length === 0 ? (
        <div style={{ marginTop: 12 }}>
          {suggestions !== null && !loading && (
            <div className="rd-fit-sub" style={{ marginBottom: 10 }}>Nothing to suggest right now: no line&apos;s module covers a missing requirement better than it already does.</div>
          )}
          <button type="button" className="btn-ghost rd-small" onClick={onFind} disabled={loading}>
            {loading ? 'Looking…' : suggestions === null ? 'Suggest edits' : 'Look again'}
          </button>
        </div>
      ) : (
        <div className="rd-sugs">
          {suggestions.map(s => {
            const stale = isStale(s)
            return (
              <div key={s.block_id} className="rd-sug">
                {s.reason && <div className="rd-sug-reason">{s.reason}</div>}
                <button type="button" className="rd-sug-text" onClick={() => onShow(s)} title="Show this line">
                  {s.new_text}
                </button>
                {stale && <div className="rd-fit-sub">You&apos;ve edited this line since. Accepting replaces your edit.</div>}
                <div className="rd-sug-actions">
                  <button type="button" className="btn-primary rd-small" onClick={() => onAccept(s)}>Accept</button>
                  <button type="button" className="btn-ghost rd-small" onClick={() => onDismiss(s)}>Keep original</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {error && <div className="rd-fit-sub" style={{ color: 'var(--rose)', marginTop: 8 }}>{error}</div>}
    </div>
  )
}
