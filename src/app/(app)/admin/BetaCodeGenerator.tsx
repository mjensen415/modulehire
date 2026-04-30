'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function BetaCodeGenerator() {
  const [count, setCount] = useState(10)
  const [prefix, setPrefix] = useState('')
  const [loading, setLoading] = useState(false)
  const [codes, setCodes] = useState<string[]>([])
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const router = useRouter()

  const generate = async () => {
    setLoading(true)
    setError('')
    setCodes([])
    setCopied(false)
    try {
      const res = await fetch('/api/admin/generate-beta-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count, prefix: prefix.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Generation failed')
      setCodes(data.codes)
      router.refresh() // re-fetch server data so BetaRequestsPanel sees the new codes
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const copyAll = () => {
    navigator.clipboard.writeText(codes.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="section-card">
      <div className="section-head">
        <div className="section-head-title">Beta Codes</div>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>Generate single-use invite codes</div>
      </div>

      <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Count</div>
          <input
            type="number"
            min={1}
            max={100}
            value={count}
            onChange={e => setCount(Number(e.target.value))}
            style={{ width: 72, padding: '6px 10px', background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 6, color: 'var(--text)', fontSize: 13, fontFamily: 'var(--mono)' }}
          />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Prefix <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></div>
          <input
            type="text"
            placeholder="e.g. LAUNCH"
            value={prefix}
            onChange={e => setPrefix(e.target.value)}
            style={{ width: 130, padding: '6px 10px', background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 6, color: 'var(--text)', fontSize: 13, fontFamily: 'var(--mono)' }}
          />
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="btn-primary"
          style={{ fontSize: 13, padding: '7px 16px' }}
        >
          {loading ? 'Generating…' : `Generate ${count} code${count !== 1 ? 's' : ''}`}
        </button>
      </div>

      {error && (
        <div style={{ margin: '0 20px 16px', padding: '8px 12px', background: 'var(--red-dim, #fef2f2)', border: '1px solid var(--border2)', borderRadius: 6, fontSize: 12, color: 'var(--red, #dc2626)' }}>
          {error}
        </div>
      )}

      {codes.length > 0 && (
        <div style={{ margin: '0 20px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>{codes.length} codes ready — save these now, they won&apos;t be shown again</div>
            <button
              onClick={copyAll}
              style={{ fontSize: 12, padding: '4px 12px', background: copied ? 'var(--teal-dim)' : 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 6, color: copied ? 'var(--teal)' : 'var(--text2)', cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all 0.15s' }}
            >
              {copied ? '✓ Copied' : 'Copy all'}
            </button>
          </div>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '12px 16px', maxHeight: 260, overflowY: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
              {codes.map(code => (
                <div
                  key={code}
                  style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 5, padding: '5px 10px', letterSpacing: '0.06em', cursor: 'pointer' }}
                  onClick={() => navigator.clipboard.writeText(code)}
                  title="Click to copy"
                >
                  {code}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
