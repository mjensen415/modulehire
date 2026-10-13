'use client'

import { useEffect, useState } from 'react'

// Side sheet for drafting outreach about a role. Copy-only — ModuleHire never sends anything,
// and drafts aren't saved.

type Recipient = 'hiring_manager' | 'team_member' | 'recruiter' | 'mutual'
type Purpose = 'referral' | 'informational' | 'follow_up'
type Channel = 'linkedin_note' | 'message'

const RECIPIENTS: Array<[Recipient, string]> = [
  ['hiring_manager', 'Hiring manager'],
  ['team_member', 'Someone on the team'],
  ['recruiter', 'Recruiter'],
  ['mutual', 'Mutual connection'],
]
const PURPOSES: Array<[Purpose, string]> = [
  ['referral', 'Ask for a referral'],
  ['informational', '15-minute chat'],
  ['follow_up', 'Follow up on my application'],
]

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        fontSize: 12, padding: '5px 11px', borderRadius: 999, cursor: 'pointer', fontFamily: 'var(--font)',
        border: `1px solid ${active ? 'var(--teal)' : 'var(--border2)'}`,
        background: active ? 'var(--teal-dim)' : 'transparent',
        color: active ? 'var(--teal)' : 'var(--text2)',
      }}
    >
      {children}
    </button>
  )
}

function DraftCard({ body, channel }: { body: string; channel: Channel }) {
  const [copied, setCopied] = useState(false)
  const count = channel === 'linkedin_note'
    ? `${body.length} / 280 characters`
    : `${body.split(/\s+/).filter(Boolean).length} / 120 words`
  return (
    <div style={{ border: '1px solid var(--border2)', borderRadius: 10, padding: '12px 14px', background: 'var(--bg2)' }}>
      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{body}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
        <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{count}</span>
        <button
          type="button"
          className="btn-ghost"
          style={{ fontSize: 12, padding: '4px 12px' }}
          onClick={() => {
            navigator.clipboard.writeText(body).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }).catch(() => {})
          }}
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

type SheetProps = {
  onClose: () => void
  jdId: string
  jobApplicationId?: string | null
  initialPurpose?: Purpose
  roleLabel?: string
}

// The body only mounts while open, so every open starts fresh from the entry point's purpose
// (e.g. the tracker's "Follow up?" nudge) with no leftover drafts.
export default function OutreachSheet({ open, ...props }: SheetProps & { open: boolean }) {
  return open ? <SheetBody {...props} /> : null
}

function SheetBody({ onClose, jdId, jobApplicationId, initialPurpose = 'informational', roleLabel }: SheetProps) {
  const [recipient, setRecipient] = useState<Recipient>('hiring_manager')
  const [purpose, setPurpose] = useState<Purpose>(initialPurpose)
  const [channel, setChannel] = useState<Channel>('linkedin_note')
  const [name, setName] = useState('')
  const [context, setContext] = useState('')
  const [drafts, setDrafts] = useState<Array<{ body: string }>>([])
  const [draftChannel, setDraftChannel] = useState<Channel>('linkedin_note')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function generate() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/outreach-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jd_id: jdId,
          job_application_id: jobApplicationId ?? undefined,
          recipient,
          purpose,
          channel,
          recipient_name: name.trim() || undefined,
          connection_context: context.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not draft outreach')
      setDrafts(data.drafts ?? [])
      setDraftChannel(channel)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 120, display: 'flex', justifyContent: 'flex-end' }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Draft outreach"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 440, height: '100%', overflowY: 'auto', background: 'var(--surface)',
          borderLeft: '1px solid var(--border2)', padding: '22px 22px 32px', display: 'flex', flexDirection: 'column', gap: 18,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>Draft outreach</div>
            {roleLabel && <div style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 2 }}>{roleLabel}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div>
          <div className="form-label" style={{ marginBottom: 6 }}>Who are you messaging?</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {RECIPIENTS.map(([v, label]) => <Chip key={v} active={recipient === v} onClick={() => setRecipient(v)}>{label}</Chip>)}
          </div>
        </div>

        <div>
          <div className="form-label" style={{ marginBottom: 6 }}>What&apos;s the ask?</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PURPOSES.map(([v, label]) => <Chip key={v} active={purpose === v} onClick={() => setPurpose(v)}>{label}</Chip>)}
          </div>
        </div>

        <div>
          <div className="form-label" style={{ marginBottom: 6 }}>Where</div>
          <div style={{ display: 'inline-flex', border: '1px solid var(--border2)', borderRadius: 8, overflow: 'hidden' }}>
            {([['linkedin_note', 'LinkedIn note'], ['message', 'Message / email']] as const).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setChannel(v)}
                aria-pressed={channel === v}
                style={{
                  border: 'none', cursor: 'pointer', padding: '6px 12px', fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font)',
                  background: channel === v ? 'var(--bg3)' : 'transparent',
                  color: channel === v ? 'var(--text)' : 'var(--text3)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 6 }}>
            {channel === 'linkedin_note' ? 'Connection notes cap at 280 characters.' : 'Kept under 120 words.'}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label className="form-label" style={{ margin: 0 }}>Their name (optional)</label>
          <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="Sam" />
          <label className="form-label" style={{ margin: '6px 0 0' }}>How do you know them? (optional)</label>
          <input className="form-input" value={context} onChange={(e) => setContext(e.target.value)} maxLength={300} placeholder="We were both at Acme in 2021" />
        </div>

        {error && <div style={{ fontSize: 12.5, color: 'var(--rose)' }}>{error}</div>}

        {drafts.length === 0 ? (
          <button type="button" className="btn-primary" onClick={generate} disabled={loading}>
            {loading ? 'Drafting…' : 'Generate'}
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {drafts.map((d, i) => <DraftCard key={`${i}:${d.body.slice(0, 20)}`} body={d.body} channel={draftChannel} />)}
            <button type="button" className="btn-ghost" onClick={generate} disabled={loading}>
              {loading ? 'Drafting…' : '↺ Regenerate'}
            </button>
            <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>
              Copy and send it yourself — ModuleHire never sends messages. Check every detail is true before you send.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Self-contained button + sheet, for server-rendered pages. */
export function OutreachButton({ jdId, roleLabel, label = 'Draft outreach', className = 'btn-ghost' }: { jdId: string; roleLabel?: string; label?: string; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={className} style={{ fontSize: 12.5 }} onClick={() => setOpen(true)}>{label}</button>
      <OutreachSheet open={open} onClose={() => setOpen(false)} jdId={jdId} roleLabel={roleLabel} />
    </>
  )
}
