'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Stage = 'idle' | 'uploading' | 'extracting' | 'parsing' | 'done' | 'error'

function IconCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M5 8l2 2 4-4" />
    </svg>
  )
}
function IconSpinner() {
  return (
    <svg className="spinner" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="8" cy="8" r="6.5" strokeDasharray="12 28" opacity="0.4" />
      <path d="M8 1.5A6.5 6.5 0 0114.5 8" />
    </svg>
  )
}
function IconPending() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="8" cy="8" r="6.5" opacity="0.4" />
      <path d="M8 5v3M8 11h.01" opacity="0.4" />
    </svg>
  )
}

function stepState(stage: Stage, stepIndex: number): 'done' | 'loading' | 'pending' {
  const stageOrder: Stage[] = ['idle', 'uploading', 'extracting', 'parsing', 'done']
  const current = stageOrder.indexOf(stage)
  if (stage === 'error') return stepIndex === 0 ? 'loading' : 'pending'
  if (current > stepIndex + 1) return 'done'
  if (current === stepIndex + 1) return 'loading'
  return 'pending'
}

const STEPS = ['Reading resume', 'Identifying skill domains…', 'Building your library']

export default function Upload() {
  const [showPaste, setShowPaste] = useState(false)
  const [stage, setStage] = useState<Stage>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [moduleCount, setModuleCount] = useState(0)
  const [pasteText, setPasteText] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const isParsing = stage !== 'idle' && stage !== 'error'

  function validateFile(file: File): string | null {
    const ok = file.type === 'application/pdf' ||
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.name.endsWith('.pdf') || file.name.endsWith('.docx')
    if (!ok) return 'Only PDF and DOCX files are supported'
    if (file.size > 10 * 1024 * 1024) return 'File must be under 10MB'
    return null
  }

  async function handleFile(file: File) {
    const err = validateFile(file)
    if (err) { setErrorMessage(err); setStage('error'); return }

    setStage('uploading')
    setErrorMessage('')

    const form = new FormData()
    form.append('file', file)

    // Optimistically advance stages while waiting for server
    const extractTimer = setTimeout(() => setStage('extracting'), 600)
    const parseTimer = setTimeout(() => setStage('parsing'), 2000)

    try {
      const res = await fetch('/api/upload-resume', { method: 'POST', body: form })
      clearTimeout(extractTimer)
      clearTimeout(parseTimer)
      setStage('parsing')

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')

      setModuleCount(data.module_count)
      sessionStorage.setItem('pendingModules', JSON.stringify({
        resume_id: data.resume_id,
        modules: data.modules,
      }))
      setStage('done')
      setTimeout(() => router.push('/module-review'), 1500)
    } catch (e) {
      clearTimeout(extractTimer)
      clearTimeout(parseTimer)
      setErrorMessage((e as Error).message)
      setStage('error')
    }
  }

  async function handlePaste() {
    if (!pasteText.trim()) return
    setStage('uploading')
    setErrorMessage('')

    const extractTimer = setTimeout(() => setStage('extracting'), 400)
    const parseTimer = setTimeout(() => setStage('parsing'), 1200)

    try {
      // Need a resume_id — create a stub resume row first via a small inline call
      // For paste, we call upload-resume with the text as a text/plain blob
      const blob = new Blob([pasteText], { type: 'text/plain' })
      const file = new File([blob], 'pasted-resume.txt', { type: 'text/plain' })
      const form = new FormData()
      form.append('file', file)

      const res = await fetch('/api/upload-resume', { method: 'POST', body: form })
      clearTimeout(extractTimer)
      clearTimeout(parseTimer)
      setStage('parsing')

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Parse failed')

      setModuleCount(data.module_count)
      sessionStorage.setItem('pendingModules', JSON.stringify({
        resume_id: data.resume_id,
        modules: data.modules,
      }))
      setStage('done')
      setTimeout(() => router.push('/module-review'), 1500)
    } catch (e) {
      clearTimeout(extractTimer)
      clearTimeout(parseTimer)
      setErrorMessage((e as Error).message)
      setStage('error')
    }
  }

  function reset() {
    setStage('idle')
    setErrorMessage('')
    setModuleCount(0)
  }

  return (
    <>
      <div className="app-topbar">
        <div>
          <span className="topbar-title">Upload Resume</span>
          <span className="topbar-sub">— Parse into modules</span>
        </div>
      </div>

      <div className="dash-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div className="upload-wrap">
          <div className="page-title">Upload your resume</div>
          <p className="page-sub">We&apos;ll parse it into skill modules. Takes about 15–30 seconds.</p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />

          <div
            className="upload-zone"
            onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag-over') }}
            onDragLeave={e => e.currentTarget.classList.remove('drag-over')}
            onDrop={e => {
              e.preventDefault()
              e.currentTarget.classList.remove('drag-over')
              const f = e.dataTransfer.files[0]
              if (f) handleFile(f)
            }}
            onClick={() => !isParsing && fileInputRef.current?.click()}
            style={isParsing ? { cursor: 'default' } : undefined}
          >
            <div className="upload-icon">
              <svg width="52" height="52" viewBox="0 0 52 52" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M26 36V16M16 24l10-10 10 10M8 42h36" />
              </svg>
            </div>
            <div className="upload-title">Drop your resume here</div>
            <p className="upload-subtext">PDF or DOCX — max 10MB</p>
            <div className="file-badges">
              {['PDF', 'DOCX'].map(t => <span key={t} className="file-badge">{t}</span>)}
            </div>
            <div className="upload-or">or</div>
            <button
              className="btn-primary"
              onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}
              disabled={isParsing}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M2 10V12h10V10M7 2v8M4 5l3-3 3 3" />
              </svg>
              Browse files
            </button>
          </div>

          <div className="paste-toggle">
            <button className="paste-toggle-btn" onClick={() => setShowPaste(v => !v)}>
              {showPaste ? 'Hide text input' : 'Or paste your resume text'}
            </button>
          </div>

          {showPaste && (
            <div className="paste-area visible">
              <textarea
                className="paste-textarea"
                placeholder="Paste your resume content here — plain text works best…"
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
              />
              <button className="btn-secondary" onClick={handlePaste} disabled={isParsing || !pasteText.trim()}>
                Parse this text →
              </button>
            </div>
          )}

          {(stage === 'uploading' || stage === 'extracting' || stage === 'parsing' || stage === 'done') && (
            <div className="parsing-state visible">
              <div className="parsing-card">
                <div className="parsing-title">
                  {stage === 'done'
                    ? `✓ Found ${moduleCount} modules — redirecting…`
                    : 'Processing your resume…'}
                </div>
                {STEPS.map((label, i) => {
                  const s = stepState(stage, i)
                  return (
                    <div key={label} className={`parse-step ${s}`}>
                      <div className={`parse-step-icon ${s}`}>
                        {s === 'done' ? <IconCheck /> : s === 'loading' ? <IconSpinner /> : <IconPending />}
                      </div>
                      <span className="parse-step-text">{label}</span>
                    </div>
                  )
                })}
                <div className="progress-bar-wrap">
                  <div className="progress-bar" style={stage === 'done' ? { width: '100%', animation: 'none' } : undefined} />
                </div>
              </div>
            </div>
          )}

          {stage === 'error' && (
            <div className="parsing-state visible">
              <div className="parsing-card" style={{ borderColor: 'var(--rose)' }}>
                <div className="parsing-title" style={{ color: 'var(--rose)' }}>Upload failed</div>
                <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>{errorMessage}</p>
                <button className="btn-ghost" onClick={reset}>Try again</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
