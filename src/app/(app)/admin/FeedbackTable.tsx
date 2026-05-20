'use client'

import { useState } from 'react'

type FeedbackItem = {
  id: string
  rating: number | null
  category: string | null
  message: string
  page_url: string | null
  created_at: string
  status: string
  user_id: string | null
}

type Props = {
  feedback: FeedbackItem[]
  feedbackUserMap: Record<string, string>
}

const NEXT_STATUS: Record<string, string> = {
  new: 'in_progress',
  in_progress: 'resolved',
  resolved: 'new',
}

function statusStyle(status: string) {
  if (status === 'resolved') return { background: 'var(--teal-dim)', color: 'var(--teal)', border: '1px solid var(--teal-glow)' }
  if (status === 'in_progress') return { background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }
  return { background: 'var(--surface2)', color: 'var(--text3)', border: '1px solid var(--border)' }
}

function statusLabel(status: string) {
  if (status === 'in_progress') return 'In progress'
  if (status === 'resolved') return 'Resolved'
  return 'New'
}

export default function FeedbackTable({ feedback, feedbackUserMap }: Props) {
  const [items, setItems] = useState<FeedbackItem[]>(feedback)
  const [statusFilter, setStatusFilter] = useState<'all' | 'new' | 'in_progress' | 'resolved'>('all')
  const [updating, setUpdating] = useState<Record<string, boolean>>({})

  async function cycleStatus(id: string, current: string) {
    const next = NEXT_STATUS[current] ?? 'new'
    setUpdating(prev => ({ ...prev, [id]: true }))
    const res = await fetch(`/api/feedback/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    if (res.ok) {
      setItems(prev => prev.map(f => f.id === id ? { ...f, status: next } : f))
    }
    setUpdating(prev => ({ ...prev, [id]: false }))
  }

  const counts = {
    all: items.length,
    new: items.filter(f => f.status === 'new').length,
    in_progress: items.filter(f => f.status === 'in_progress').length,
    resolved: items.filter(f => f.status === 'resolved').length,
  }

  const visible = statusFilter === 'all' ? items : items.filter(f => f.status === statusFilter)

  const filterButtons: Array<{ key: typeof statusFilter; label: string; count: number }> = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'new', label: 'New', count: counts.new },
    { key: 'in_progress', label: 'In progress', count: counts.in_progress },
    { key: 'resolved', label: 'Resolved', count: counts.resolved },
  ]

  return (
    <div className="section-card" style={{ marginTop: 24 }}>
      <div className="section-head">
        <div className="section-head-title">Beta feedback</div>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>
          {items.length} most recent
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {filterButtons.map(b => (
          <button
            key={b.key}
            className={statusFilter === b.key ? 'btn-primary' : 'btn-ghost'}
            style={{ fontSize: 12, padding: '4px 12px' }}
            onClick={() => setStatusFilter(b.key)}
          >
            {b.label} ({b.count})
          </button>
        ))}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>User</th>
              <th>Rating</th>
              <th>Category</th>
              <th>Status</th>
              <th>Page</th>
              <th>Message</th>
              <th>Reply</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(f => {
              const email = feedbackUserMap[f.user_id ?? '']
              const subject = encodeURIComponent('Re: Your ModuleHire feedback')
              const body = encodeURIComponent(
                `Hi there,\n\nThank you for your feedback!\n\n"${f.message}"\n\nI've taken a look and here's what I found:\n\n[YOUR RESPONSE HERE]\n\nThank you again!\n-MJ`
              )
              const mailto = `mailto:${email ?? ''}?subject=${subject}&body=${body}`
              return (
                <tr key={f.id}>
                  <td style={{ fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                    {new Date(f.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                  </td>
                  <td style={{ fontSize: 12 }}>{email ?? '—'}</td>
                  <td style={{ fontSize: 13, textAlign: 'center' }}>
                    {f.rating ? '★'.repeat(f.rating) + '☆'.repeat(5 - f.rating) : '—'}
                  </td>
                  <td>
                    {f.category && (
                      <span className={`plan-chip plan-${f.category === 'bug' ? 'free' : f.category === 'feature' ? 'standard' : f.category === 'praise' ? 'pro' : 'free'}`}>
                        {f.category}
                      </span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
                      <button
                        onClick={() => cycleStatus(f.id, f.status)}
                        disabled={!!updating[f.id]}
                        style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, cursor: 'pointer', ...statusStyle(f.status) }}
                      >
                        {updating[f.id] ? '…' : statusLabel(f.status)}
                      </button>
                      <span style={{ fontSize: 10, color: 'var(--text3)' }}>click to advance</span>
                    </div>
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                    {f.page_url ?? '—'}
                  </td>
                  <td style={{ fontSize: 12, maxWidth: 360, color: 'var(--text2)' }}>{f.message}</td>
                  <td>
                    {email ? (
                      <a
                        href={mailto}
                        style={{ fontSize: 11, color: 'var(--teal)', textDecoration: 'none', whiteSpace: 'nowrap' }}
                      >
                        Reply ↗
                      </a>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--text3)' }}>—</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {visible.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, padding: '24px 0' }}>No feedback{statusFilter === 'all' ? ' yet' : ` in "${statusLabel(statusFilter)}"`}.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
