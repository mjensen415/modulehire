'use client'

import { useEffect, useState } from 'react'

type Category = 'bug' | 'feature' | 'general' | 'praise'

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'bug', label: '🐛 Bug report' },
  { value: 'feature', label: '💡 Feature idea' },
  { value: 'general', label: '💬 General' },
  { value: 'praise', label: '👏 Love it' },
]

export default function FeedbackModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [rating, setRating] = useState<number>(0)
  const [category, setCategory] = useState<Category | ''>('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  // Reset everything whenever the modal closes
  useEffect(() => {
    if (!isOpen) {
      setRating(0)
      setCategory('')
      setMessage('')
      setSubmitting(false)
      setSubmitted(false)
      setError('')
    }
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const trimmedMessage = message.trim()
  const canSubmit = rating > 0 && trimmedMessage.length >= 10 && !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/beta-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          category: category || undefined,
          message: trimmedMessage,
          page_url: typeof window !== 'undefined' ? window.location.pathname : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Could not send feedback')
      setSubmitted(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Beta feedback"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 460,
          background: 'var(--surface)',
          border: '1px solid var(--border2)',
          borderRadius: 12,
          boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
          padding: '20px 22px',
          fontFamily: 'var(--font)',
          color: 'var(--text)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: submitted ? 12 : 18 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Beta feedback</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text3)', fontSize: 20, lineHeight: 1, padding: '0 4px',
            }}
          >×</button>
        </div>

        {submitted ? (
          <div>
            <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 18, lineHeight: 1.5 }}>
              Thanks for the feedback! 🙏 We read every response.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-primary" onClick={onClose}>Close</button>
            </div>
          </div>
        ) : (
          <>
            {/* Rating */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>How&apos;s it going? <span style={{ color: 'var(--rose)' }}>*</span></div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[1, 2, 3, 4, 5].map(n => {
                  const on = rating === n
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(n)}
                      style={{
                        width: 38, height: 38, borderRadius: 8,
                        border: `1px solid ${on ? 'var(--teal-glow)' : 'var(--border2)'}`,
                        background: on ? 'var(--teal)' : 'var(--bg3)',
                        color: on ? '#000' : 'var(--text2)',
                        fontWeight: 600, fontSize: 14,
                        cursor: 'pointer',
                        fontFamily: 'var(--font)',
                        transition: 'all 0.15s',
                      }}
                    >{n}</button>
                  )
                })}
              </div>
            </div>

            {/* Category */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>What kind of feedback?</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {CATEGORIES.map(c => {
                  const on = category === c.value
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setCategory(on ? '' : c.value)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 999,
                        border: `1px solid ${on ? 'var(--teal-glow)' : 'var(--border2)'}`,
                        background: on ? 'var(--teal-dim)' : 'var(--bg3)',
                        color: on ? 'var(--teal)' : 'var(--text2)',
                        fontSize: 12,
                        fontWeight: on ? 600 : 400,
                        cursor: 'pointer',
                        fontFamily: 'var(--font)',
                        transition: 'all 0.15s',
                      }}
                    >{c.label}</button>
                  )
                })}
              </div>
            </div>

            {/* Message */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>Your message <span style={{ color: 'var(--rose)' }}>*</span></div>
              <textarea
                className="mod-edit-textarea"
                rows={4}
                placeholder="What's on your mind? Anything broken, confusing, or missing?"
                value={message}
                onChange={e => setMessage(e.target.value)}
                style={{ width: '100%', resize: 'vertical' }}
              />
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                {trimmedMessage.length < 10
                  ? `${trimmedMessage.length}/10 characters minimum`
                  : `${trimmedMessage.length} characters`}
              </div>
            </div>

            {error && (
              <div style={{
                background: 'oklch(0.4 0.18 10 / 0.15)',
                border: '1px solid var(--rose)',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 12,
                color: 'var(--rose)',
                marginBottom: 14,
              }}>{error}</div>
            )}

            {/* Footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>We read every response.</span>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSubmit}
                disabled={!canSubmit}
                style={!canSubmit ? { opacity: 0.5 } : undefined}
              >
                {submitting ? 'Sending…' : 'Send feedback'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
