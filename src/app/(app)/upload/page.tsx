'use client'

import { useRef, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type Stage = 'idle' | 'uploading' | 'extracting' | 'parsing' | 'done' | 'error'

// ---------------------------------------------------------------------------
// Resume parse animation
// ---------------------------------------------------------------------------

const MODULE_LABELS = [
  { label: 'Community Strategy', color: '#4ec9b0' },
  { label: 'Developer Relations', color: '#569cd6' },
  { label: 'Leadership & Scale', color: '#c586c0' },
  { label: 'Growth & Retention', color: '#dcdcaa' },
]

const CUT_COLORS = ['#4ec9b0', '#569cd6', '#c586c0', '#dcdcaa']

function ResumeParseAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    if (!ctx) return

    const W = canvas.width
    const H = canvas.height

    // timeline: 0–1 (looping every CYCLE ms)
    const CYCLE = 4000

    let startTime = performance.now()

    function lerp(a: number, b: number, t: number) { return a + (b - a) * t }
    function clamp01(v: number) { return Math.max(0, Math.min(1, v)) }
    function ease(t: number) { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t }

    function drawDoc(x: number, y: number, w: number, h: number, alpha: number) {
      if (alpha <= 0) return
      ctx.save()
      ctx.globalAlpha = alpha
      // shadow
      ctx.shadowColor = 'rgba(0,0,0,0.25)'
      ctx.shadowBlur = 10
      ctx.shadowOffsetY = 4
      ctx.fillStyle = '#1e2433'
      ctx.strokeStyle = '#3a4155'
      ctx.lineWidth = 1
      roundRect(ctx, x, y, w, h, 6)
      ctx.fill()
      ctx.stroke()
      ctx.shadowColor = 'transparent'
      // text lines
      const lineColors = ['#4a5568', '#4a5568', '#3a4155', '#4a5568', '#3a4155', '#4a5568', '#4a5568', '#3a4155']
      const lineWidths = [0.7, 0.9, 0.5, 0.85, 0.6, 0.8, 0.4, 0.7]
      for (let i = 0; i < 8; i++) {
        const ly = y + 18 + i * 12
        ctx.fillStyle = lineColors[i]
        ctx.fillRect(x + 14, ly, (w - 28) * lineWidths[i], 4)
      }
      ctx.restore()
    }

    function drawModuleCard(x: number, y: number, w: number, h: number, label: string, color: string, alpha: number) {
      if (alpha <= 0) return
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.shadowColor = 'rgba(0,0,0,0.2)'
      ctx.shadowBlur = 8
      ctx.shadowOffsetY = 3
      ctx.fillStyle = '#1e2433'
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      roundRect(ctx, x, y, w, h, 5)
      ctx.fill()
      ctx.stroke()
      ctx.shadowColor = 'transparent'
      // accent bar
      ctx.fillStyle = color
      ctx.globalAlpha = alpha * 0.8
      roundRect(ctx, x, y, 3, h, [5, 0, 0, 5])
      ctx.fill()
      // label text
      ctx.globalAlpha = alpha
      ctx.fillStyle = '#e2e8f0'
      ctx.font = '600 10px -apple-system, system-ui, sans-serif'
      ctx.fillText(label, x + 12, y + h / 2 + 4)
      ctx.restore()
    }

    function roundRect(
      c: CanvasRenderingContext2D,
      x: number, y: number, w: number, h: number,
      r: number | number[]
    ) {
      const [tl, tr, br, bl] = Array.isArray(r) ? r : [r, r, r, r]
      c.beginPath()
      c.moveTo(x + tl, y)
      c.lineTo(x + w - tr, y)
      c.quadraticCurveTo(x + w, y, x + w, y + tr)
      c.lineTo(x + w, y + h - br)
      c.quadraticCurveTo(x + w, y + h, x + w - br, y + h)
      c.lineTo(x + bl, y + h)
      c.quadraticCurveTo(x, y + h, x, y + h - bl)
      c.lineTo(x, y + tl)
      c.quadraticCurveTo(x, y, x + tl, y)
      c.closePath()
    }

    function draw(now: number) {
      const elapsed = (now - startTime) % CYCLE
      const t = elapsed / CYCLE // 0→1

      ctx.clearRect(0, 0, W, H)

      // Layout constants
      const docX = 30, docY = (H - 120) / 2, docW = 90, docH = 120
      const arrowStartX = 140, arrowEndX = 180
      const cardX = 185, cardW = 130, cardH = 28
      const cardSpacing = 34
      const cardsStartY = (H - (MODULE_LABELS.length * cardSpacing - (cardSpacing - cardH))) / 2

      // Phase 1 (0–0.2): doc fades in
      const docFadeIn = clamp01(t / 0.2)
      // Phase 2 (0.25–0.55): cut lines sweep across + doc fades out
      const cutProgress = clamp01((t - 0.25) / 0.3)
      const docFadeOut = 1 - clamp01((t - 0.35) / 0.2)
      const docAlpha = ease(docFadeIn) * ease(docFadeOut)

      // Phase 3 (0.45–0.65): arrows fade in
      const arrowAlpha = ease(clamp01((t - 0.45) / 0.2))

      // Phase 4 (0.5–0.8): cards stagger in
      const cardsFadeStart = 0.5
      const cardsFadeEnd = 0.8

      // Phase 5 (0.85–1.0): everything fades out
      const globalFadeOut = ease(clamp01((t - 0.85) / 0.15))
      const globalAlpha = 1 - globalFadeOut

      ctx.save()
      ctx.globalAlpha = globalAlpha

      // Draw document
      drawDoc(docX, docY, docW, docH, docAlpha)

      // Draw cut lines
      if (cutProgress > 0 && docAlpha > 0.05) {
        const numCuts = 4
        for (let i = 0; i < numCuts; i++) {
          const lineY = docY + 20 + i * (docH - 30) / (numCuts - 1)
          const lineDelay = i / numCuts
          const lineProgress = clamp01((cutProgress - lineDelay * 0.6) / 0.4)
          if (lineProgress <= 0) continue
          const lineX = docX + docW * lineProgress
          ctx.save()
          ctx.globalAlpha = globalAlpha * clamp01(lineProgress * 3) * docAlpha
          ctx.strokeStyle = CUT_COLORS[i]
          ctx.lineWidth = 1.5
          ctx.setLineDash([4, 3])
          ctx.beginPath()
          ctx.moveTo(docX, lineY)
          ctx.lineTo(lineX, lineY)
          ctx.stroke()
          ctx.setLineDash([])
          // scissor emoji at tip
          if (lineProgress > 0.1 && lineProgress < 0.95) {
            ctx.font = '11px serif'
            ctx.globalAlpha = globalAlpha * 0.9
            ctx.fillText('✂', lineX - 6, lineY + 4)
          }
          ctx.restore()
        }
      }

      // Draw arrows
      if (arrowAlpha > 0) {
        for (let i = 0; i < MODULE_LABELS.length; i++) {
          const arrowY = cardsStartY + i * cardSpacing + cardH / 2
          ctx.save()
          ctx.globalAlpha = globalAlpha * arrowAlpha * 0.7
          ctx.strokeStyle = MODULE_LABELS[i].color
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.moveTo(arrowStartX, arrowY)
          ctx.lineTo(arrowEndX - 6, arrowY)
          ctx.stroke()
          // arrowhead
          ctx.beginPath()
          ctx.moveTo(arrowEndX - 6, arrowY - 4)
          ctx.lineTo(arrowEndX, arrowY)
          ctx.lineTo(arrowEndX - 6, arrowY + 4)
          ctx.stroke()
          ctx.restore()
        }
      }

      // Draw module cards
      for (let i = 0; i < MODULE_LABELS.length; i++) {
        const cardStart = cardsFadeStart + i * 0.06
        const cardEnd = cardStart + 0.15
        const cardAlpha = ease(clamp01((t - cardStart) / (cardEnd - cardStart)))
        if (cardAlpha <= 0) continue
        const cardY = cardsStartY + i * cardSpacing
        drawModuleCard(
          cardX, cardY, cardW, cardH,
          MODULE_LABELS[i].label,
          MODULE_LABELS[i].color,
          cardAlpha
        )
      }

      ctx.restore()

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      width={340}
      height={180}
      style={{ display: 'block', margin: '0 auto' }}
    />
  )
}

// ---------------------------------------------------------------------------
// Step indicators
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Upload() {
  const [showPaste, setShowPaste] = useState(false)
  const [stage, setStage] = useState<Stage>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [moduleCount, setModuleCount] = useState(0)
  const [pasteText, setPasteText] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const isParsing = stage !== 'idle' && stage !== 'error'
  const isProcessing = stage === 'uploading' || stage === 'extracting' || stage === 'parsing'

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

    try {
      const uploadRes = await fetch('/api/upload-resume', { method: 'POST', body: form })
      const uploadData = await uploadRes.json()
      if (!uploadRes.ok) throw new Error(uploadData.error ?? 'Upload failed')

      setStage('extracting')
      await new Promise(r => setTimeout(r, 200))

      setStage('parsing')
      const parseRes = await fetch('/api/parse-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume_id: uploadData.resume_id, raw_text: uploadData.raw_text }),
      })
      let parseData: { error?: string; module_count?: number; modules?: unknown[] } = {}
      try { parseData = await parseRes.json() } catch { /* non-JSON 504 */ }
      if (!parseRes.ok) {
        if (parseRes.status === 504) throw new Error('AI parse timed out — model took too long. Try again or paste a shorter resume.')
        throw new Error(parseData.error ?? `Server error ${parseRes.status}`)
      }

      setModuleCount(parseData.module_count ?? 0)
      sessionStorage.setItem('pendingModules', JSON.stringify({
        resume_id: uploadData.resume_id,
        modules: parseData.modules,
      }))
      setStage('done')
      setTimeout(() => router.push('/module-review'), 1500)
    } catch (e) {
      setErrorMessage((e as Error).message)
      setStage('error')
    }
  }

  async function handlePaste() {
    if (!pasteText.trim()) return
    setStage('uploading')
    setErrorMessage('')

    try {
      const blob = new Blob([pasteText], { type: 'text/plain' })
      const file = new File([blob], 'pasted-resume.txt', { type: 'text/plain' })
      const form = new FormData()
      form.append('file', file)

      const uploadRes = await fetch('/api/upload-resume', { method: 'POST', body: form })
      const uploadData = await uploadRes.json()
      if (!uploadRes.ok) throw new Error(uploadData.error ?? 'Upload failed')

      setStage('extracting')
      await new Promise(r => setTimeout(r, 200))

      setStage('parsing')
      const parseRes = await fetch('/api/parse-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume_id: uploadData.resume_id, raw_text: uploadData.raw_text }),
      })
      let parseData: { error?: string; module_count?: number; modules?: unknown[] } = {}
      try { parseData = await parseRes.json() } catch { /* non-JSON 504 */ }
      if (!parseRes.ok) {
        if (parseRes.status === 504) throw new Error('AI parse timed out — model took too long. Try again or paste a shorter resume.')
        throw new Error(parseData.error ?? `Server error ${parseRes.status}`)
      }

      setModuleCount(parseData.module_count ?? 0)
      sessionStorage.setItem('pendingModules', JSON.stringify({
        resume_id: uploadData.resume_id,
        modules: parseData.modules,
      }))
      setStage('done')
      setTimeout(() => router.push('/module-review'), 1500)
    } catch (e) {
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

          {/* Upload zone — hidden while processing */}
          {!isParsing && (
            <>
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
                onClick={() => fileInputRef.current?.click()}
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
                  <button className="btn-secondary" onClick={handlePaste} disabled={!pasteText.trim()}>
                    Parse this text →
                  </button>
                </div>
              )}
            </>
          )}

          {/* Processing state with animation */}
          {isProcessing && (
            <div className="parsing-state visible">
              <div className="parsing-card">
                <div className="parsing-title">Processing your resume…</div>

                <ResumeParseAnimation />

                <div style={{ marginTop: 16 }}>
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
                </div>

                <div className="progress-bar-wrap">
                  <div className="progress-bar" />
                </div>
              </div>
            </div>
          )}

          {/* Done state */}
          {stage === 'done' && (
            <div className="parsing-state visible">
              <div className="parsing-card">
                <div className="parsing-title">✓ Found {moduleCount} modules — redirecting…</div>
                {STEPS.map((label, i) => (
                  <div key={label} className="parse-step done">
                    <div className="parse-step-icon done"><IconCheck /></div>
                    <span className="parse-step-text">{label}</span>
                  </div>
                ))}
                <div className="progress-bar-wrap">
                  <div className="progress-bar" style={{ width: '100%', animation: 'none' }} />
                </div>
              </div>
            </div>
          )}

          {/* Error state */}
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
