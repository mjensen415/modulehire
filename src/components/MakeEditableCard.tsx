'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/** POST /api/resume-docs/from-generated/[id]; resolves on success, throws with the message. */
export async function makeResumeEditable(resumeId: string): Promise<void> {
  const res = await fetch(`/api/resume-docs/from-generated/${resumeId}`, { method: 'POST' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'We couldn\'t rebuild this resume. Try again.')
}

// Shown on /resumes/[id] for resumes made before the live editor.
export default function MakeEditableCard({ resumeId }: { resumeId: string }) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'working' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const run = async () => {
    setState('working')
    try {
      await makeResumeEditable(resumeId)
      router.refresh()
    } catch (e) {
      setMessage((e as Error).message)
      setState('error')
    }
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 12, padding: '18px 20px' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Edit this resume line by line</div>
      <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 14 }}>
        We&apos;ll rebuild it from the same modules so you can edit, reword, and re-export it. Your original file stays here.
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" className="btn-primary" onClick={run} disabled={state === 'working'}>
          {state === 'working' ? 'Rebuilding…' : 'Make it editable'}
        </button>
        {state === 'error' && <span style={{ fontSize: 12.5, color: 'var(--rose)' }}>{message}</span>}
      </div>
    </div>
  )
}
