'use client'

import { useCallback, useEffect, useState } from 'react'
import type { RepairOp } from '@/lib/library-health'

type Repair = { id: string; created_at: string; undone_at: string | null }
type UserRow = {
  user_id: string
  email: string
  name: string | null
  modules: number
  jobs: number
  unlinked: number
  multi_company: number
  duplicates: number
  wide_jobs: number
  repairs: Repair[]
}
type Preview = { ops: RepairOp[]; outline_roles: number }

const OP_LABELS: Record<RepairOp['op'], string> = {
  link: 'Link to a job',
  hide: 'Hide duplicate copy',
  positioning: 'Make career-level (no company)',
  job_dates: 'Reset job dates',
}

export default function LibraryHealthClient({ currentUserId }: { currentUserId: string }) {
  const [rows, setRows] = useState<UserRow[] | null>(null)
  const [auditTable, setAuditTable] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [preview, setPreview] = useState<Record<string, Preview>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [message, setMessage] = useState<Record<string, string>>({})

  const load = useCallback(() => {
    fetch('/api/admin/library-health')
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error)
        setRows(d.users)
        setAuditTable(d.audit_table)
      })
      .catch(e => setError((e as Error).message))
  }, [])
  useEffect(() => { load() }, [load])

  const runPreview = async (userId: string) => {
    setBusy(userId)
    setOpen(userId)
    setConfirmText('')
    setMessage(m => ({ ...m, [userId]: '' }))
    try {
      const res = await fetch(`/api/admin/library-health/${userId}/preview`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPreview(p => ({ ...p, [userId]: { ops: data.ops, outline_roles: data.outline_roles } }))
    } catch (e) {
      setMessage(m => ({ ...m, [userId]: (e as Error).message }))
    } finally {
      setBusy(null)
    }
  }

  const apply = async (row: UserRow) => {
    const ops = preview[row.user_id]?.ops ?? []
    if (ops.length === 0) return
    const self = row.user_id === currentUserId
    if (self && !window.confirm(`Apply ${ops.length} changes to your own library? You can undo it.`)) return
    setBusy(row.user_id)
    try {
      const res = await fetch(`/api/admin/library-health/${row.user_id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ops }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMessage(m => ({ ...m, [row.user_id]: `Applied ${ops.length} changes.` }))
      setPreview(p => { const n = { ...p }; delete n[row.user_id]; return n })
      load()
    } catch (e) {
      setMessage(m => ({ ...m, [row.user_id]: (e as Error).message }))
    } finally {
      setBusy(null)
    }
  }

  const undo = async (userId: string, repairId: string) => {
    if (!window.confirm('Undo this repair and restore the library to how it was before?')) return
    setBusy(userId)
    try {
      const res = await fetch(`/api/admin/library-repairs/${repairId}/undo`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMessage(m => ({ ...m, [userId]: 'Repair undone.' }))
      load()
    } catch (e) {
      setMessage(m => ({ ...m, [userId]: (e as Error).message }))
    } finally {
      setBusy(null)
    }
  }

  if (error) return <div style={{ color: 'var(--rose)', fontSize: 13 }}>{error}</div>
  if (!rows) return <div style={{ fontSize: 13, color: 'var(--text3)' }}>Loading libraries…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <style>{CSS}</style>
      <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0, maxWidth: 760, lineHeight: 1.5 }}>
        Nothing here runs on its own. Preview shows exactly what a fix would change; Apply runs it in one transaction with
        an audit row, and every applied repair can be undone. Don&apos;t apply to someone else&apos;s account without Matt&apos;s sign-off.
      </p>
      {!auditTable && (
        <div className="lh-warn">The <code>library_repairs</code> migration isn&apos;t applied, so Apply and Undo won&apos;t work yet. Preview still does.</div>
      )}
      <table className="lh-table">
        <thead>
          <tr>
            <th>User</th><th>Modules</th><th>Jobs</th><th>Unlinked</th><th>Multi-company</th><th>Duplicates</th><th>Wide job dates</th><th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const p = preview[row.user_id]
            const self = row.user_id === currentUserId
            const grouped = (p?.ops ?? []).reduce<Record<string, RepairOp[]>>((g, op) => ({ ...g, [op.op]: [...(g[op.op] ?? []), op] }), {})
            const lastRepair = row.repairs.find(r => !r.undone_at)
            return [
              <tr key={row.user_id}>
                <td><div style={{ fontWeight: 600 }}>{row.email}</div>{row.name && <div className="lh-sub">{row.name}</div>}</td>
                <td>{row.modules}</td>
                <td>{row.jobs}</td>
                <td className={row.unlinked ? 'lh-bad' : ''}>{row.unlinked}</td>
                <td className={row.multi_company ? 'lh-bad' : ''}>{row.multi_company}</td>
                <td className={row.duplicates ? 'lh-bad' : ''}>{row.duplicates}</td>
                <td className={row.wide_jobs ? 'lh-bad' : ''}>{row.wide_jobs}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button type="button" className="btn-ghost lh-btn" onClick={() => runPreview(row.user_id)} disabled={busy === row.user_id}>
                    {busy === row.user_id && open === row.user_id && !p ? 'Previewing…' : 'Preview fix'}
                  </button>
                  {lastRepair && (
                    <button type="button" className="btn-ghost lh-btn" onClick={() => undo(row.user_id, lastRepair.id)} disabled={busy === row.user_id} title={`Applied ${new Date(lastRepair.created_at).toLocaleString()}`}>
                      Undo last repair
                    </button>
                  )}
                </td>
              </tr>,
              open === row.user_id && (p || message[row.user_id]) ? (
                <tr key={`${row.user_id}-preview`} className="lh-preview-row">
                  <td colSpan={8}>
                    {message[row.user_id] && <div className="lh-msg">{message[row.user_id]}</div>}
                    {p && (
                      <>
                        <div className="lh-sub" style={{ marginBottom: 8 }}>
                          {p.ops.length} changes. Job dates checked against {p.outline_roles} roles in their latest resume.
                        </div>
                        {(Object.keys(OP_LABELS) as RepairOp['op'][]).filter(k => grouped[k]?.length).map(k => (
                          <details key={k} className="lh-group">
                            <summary>{OP_LABELS[k]} ({grouped[k].length})</summary>
                            <ul>{grouped[k].map((op, i) => <li key={i}>{op.why}</li>)}</ul>
                          </details>
                        ))}
                        {p.ops.length > 0 && (
                          <div className="lh-apply">
                            {!self && (
                              <label className="lh-sub">
                                This is {row.email}&apos;s library. Type their email to apply (needs Matt&apos;s sign-off):
                                <input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder={row.email} className="form-input" style={{ marginTop: 4, fontSize: 12.5 }} />
                              </label>
                            )}
                            <button
                              type="button"
                              className="btn-primary lh-btn"
                              disabled={busy === row.user_id || !auditTable || (!self && confirmText.trim() !== row.email)}
                              onClick={() => apply(row)}
                            >
                              Apply fix
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ) : null,
            ]
          })}
        </tbody>
      </table>
    </div>
  )
}

const CSS = `
.lh-table { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--surface); border: 1px solid var(--border2); border-radius: 10px; overflow: hidden; }
.lh-table th { text-align: left; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text3); padding: 10px 12px; border-bottom: 1px solid var(--border2); }
.lh-table td { padding: 10px 12px; border-bottom: 1px solid var(--border2); color: var(--text2); vertical-align: top; }
.lh-bad { color: var(--rose); font-weight: 600; }
.lh-sub { font-size: 12px; color: var(--text3); }
.lh-btn { font-size: 12px; padding: 5px 10px; margin-left: 6px; }
.lh-preview-row td { background: var(--bg3); }
.lh-group { margin: 4px 0; font-size: 12.5px; }
.lh-group summary { cursor: pointer; font-weight: 600; color: var(--text); }
.lh-group ul { margin: 6px 0 8px; padding-left: 18px; max-height: 260px; overflow-y: auto; color: var(--text2); }
.lh-apply { display: flex; align-items: flex-end; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
.lh-msg { font-size: 12.5px; color: var(--text); margin-bottom: 8px; }
.lh-warn { font-size: 12.5px; padding: 10px 12px; border: 1px solid var(--amber, #b7791f); border-radius: 8px; color: var(--text); }
`
