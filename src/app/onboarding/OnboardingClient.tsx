'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Step = 1 | 2 | 3 | 4
type JobPreview = { id: string; company: string; title: string | null; module_count: number }

const PARSE_COPY = [
  'Reading your resume…',
  'Finding your work history…',
  'Building your modules…',
  'Almost there…',
]
const GEN_COPY = [
  'Matching your experience to the role…',
  'Selecting your strongest modules…',
  'Assembling your resume…',
  'Running ATS Estimator…',
]

function AnimatedCopy({ lines }: { lines: string[] }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI(prev => (prev + 1) % lines.length), 4000)
    return () => clearInterval(t)
  }, [lines.length])
  return (
    <div style={{ textAlign: 'center', padding: '60px 0' }}>
      <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>{lines[i]}</div>
      <div style={{
        margin: '0 auto', width: 40, height: 40, borderRadius: '50%',
        border: '3px solid var(--border)', borderTopColor: 'var(--teal)',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function StepBadge({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div style={{ fontSize: 12, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 18 }}>
      Step {step} of 3
    </div>
  )
}

export default function OnboardingClient({
  initialStep,
  initialModuleCount,
}: {
  initialStep: 1 | 2 | 3
  initialModuleCount: number
}) {
  const router = useRouter()
  const [step, setStep] = useState<Step>(initialStep)
  const [parsing, setParsing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jdText, setJdText] = useState('')
  const [moduleCount, setModuleCount] = useState(initialModuleCount)
  const [jobs, setJobs] = useState<JobPreview[]>([])
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [downloadFilename, setDownloadFilename] = useState<string>('Resume.pdf')
  const [atsScore, setAtsScore] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  useEffect(() => {
    if (step === 2 && jobs.length === 0) loadLibraryPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  async function loadLibraryPreview() {
    try {
      const [jobsRes, modsRes, assignRes] = await Promise.all([
        fetch('/api/job-experiences'),
        fetch('/api/my-modules'),
        fetch('/api/module-job-assignments'),
      ])
      const jobsData = await jobsRes.json()
      const modsData = await modsRes.json()
      const assignData = await assignRes.json()
      const counts: Record<string, number> = {}
      for (const a of assignData.assignments ?? []) counts[a.job_id] = (counts[a.job_id] ?? 0) + 1
      const list: JobPreview[] = (jobsData.jobs ?? []).map((j: { id: string; company: string; title: string | null }) => ({
        id: j.id, company: j.company, title: j.title, module_count: counts[j.id] ?? 0,
      }))
      setJobs(list)
      setModuleCount(modsData.modules?.length ?? moduleCount)
    } catch {
      // Non-fatal — page still works
    }
  }

  function validateFile(file: File): string | null {
    const ok = file.type === 'application/pdf'
      || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      || file.name.toLowerCase().endsWith('.pdf')
      || file.name.toLowerCase().endsWith('.docx')
    if (!ok) return 'We can only read PDF or Word documents. Try converting your file first.'
    if (file.size > 10 * 1024 * 1024) return 'That file is too large. Try a smaller version or a plain PDF.'
    return null
  }

  function pickFile(file: File) {
    const err = validateFile(file)
    if (err) { setError(err); setPendingFile(null); return }
    setError(null)
    setPendingFile(file)
  }

  async function startUpload() {
    if (!pendingFile) return
    setError(null)
    setParsing(true)
    try {
      const form = new FormData()
      form.append('file', pendingFile)
      const uploadRes = await fetch('/api/upload-resume', { method: 'POST', body: form })
      const uploadData = await uploadRes.json()
      if (!uploadRes.ok) throw new Error(uploadData.error ?? 'Upload failed')

      const parseRes = await fetch('/api/parse-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume_id: uploadData.resume_id, raw_text: uploadData.raw_text }),
      })
      const parseData = await parseRes.json().catch(() => ({}))
      if (!parseRes.ok || !parseData.module_count) {
        throw new Error(parseData.error ?? "We couldn't read your resume clearly.")
      }
      setModuleCount(parseData.module_count)
      setParsing(false)
      setPendingFile(null)
      setStep(2)
    } catch (e) {
      setParsing(false)
      setError((e as Error).message)
    }
  }

  async function runGeneration() {
    setError(null)
    setGenerating(true)
    try {
      const analyzeRes = await fetch('/api/analyze-jd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: jdText }),
      })
      const analyzeData = await analyzeRes.json()
      if (!analyzeRes.ok || !analyzeData.jd_id) throw new Error(analyzeData.error ?? 'Could not read job description')

      const matchRes = await fetch('/api/match-modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jd_id: analyzeData.jd_id }),
      })
      const matchData = await matchRes.json()
      if (!matchRes.ok) throw new Error(matchData.error ?? 'Could not match modules')

      const stack: string[] = matchData.recommended_stack?.length
        ? matchData.recommended_stack
        : (matchData.ranked_modules ?? []).slice(0, 6).map((r: { module_id: string }) => r.module_id)
      if (stack.length === 0) throw new Error('No modules available to generate a resume.')

      const profileRes = await fetch('/api/me')
      const profile = await profileRes.json()

      const genRes = await fetch('/api/generate-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module_ids: stack,
          jd_id: analyzeData.jd_id,
          contact: {
            name: profile.name ?? '',
            email: profile.email ?? '',
            phone: profile.phone ?? '',
            linkedin: profile.linkedin_url ?? '',
            location: profile.location ?? '',
          },
          summary_override: profile.summary || undefined,
          include_summary: !!profile.summary,
          education: [],
          skills: [],
          include_skills_section: false,
          include_education_section: false,
          include_awards_section: false,
          cover_letter: { include: false, tone: 'professional' },
          format: 'classic',
        }),
      })
      const genData = await genRes.json()
      if (!genRes.ok) throw new Error(genData.error ?? 'Generation failed')

      setDownloadUrl(genData.pdf_url ?? genData.docx_url ?? null)
      setDownloadFilename((genData.docx_filename ?? 'Resume.docx').replace(/\.docx$/, '.pdf'))
      setAtsScore(typeof genData.ats_score === 'number' ? genData.ats_score : null)
      setGenerating(false)
      setStep(4)
    } catch (e) {
      setGenerating(false)
      setError((e as Error).message)
    }
  }

  async function completeOnboarding(destination = '/dashboard') {
    try { await fetch('/api/onboarding/status', { method: 'POST' }) } catch {}
    router.push(destination)
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (parsing) {
    return <AnimatedCopy lines={PARSE_COPY} />
  }
  if (generating) {
    return <AnimatedCopy lines={GEN_COPY} />
  }

  if (step === 1) {
    return (
      <div>
        <StepBadge step={1} />
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Let&apos;s build your module library.</h1>
        <p style={{ fontSize: 15, color: 'var(--text2)', marginBottom: 28 }}>
          Upload your current resume and we&apos;ll break it into reusable modules you can mix and match for every job you apply to.
        </p>

        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault(); setDragOver(false)
            const f = e.dataTransfer.files?.[0]; if (f) pickFile(f)
          }}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? 'var(--teal)' : 'var(--border2)'}`,
            borderRadius: 10, padding: '48px 24px', textAlign: 'center', cursor: 'pointer',
            background: dragOver ? 'var(--teal-dim)' : 'var(--surface)',
            transition: 'background 0.15s, border-color 0.15s',
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
            {pendingFile ? pendingFile.name : 'Drop your resume here'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>
            {pendingFile
              ? `${(pendingFile.size / 1024).toFixed(0)} KB · click to choose a different file`
              : 'or click to select a file'}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f) }}
          />
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8, textAlign: 'center' }}>
          PDF (recommended) or .docx · max 10MB
        </div>

        {error && <div style={{ marginTop: 14, fontSize: 13, color: 'var(--rose)' }}>{error}</div>}

        {pendingFile && (
          <div style={{ marginTop: 18, textAlign: 'center' }}>
            <button className="btn-primary" onClick={startUpload} style={{ display: 'inline-flex' }}>Upload &amp; Continue →</button>
          </div>
        )}

        <div style={{ marginTop: 28, textAlign: 'center', fontSize: 12 }}>
          <a href="/library" style={{ color: 'var(--text3)' }}>Don&apos;t have a resume file handy? Build your library manually →</a>
        </div>
      </div>
    )
  }

  if (step === 2) {
    return (
      <div>
        <StepBadge step={2} />
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Your module library is ready.</h1>
        <p style={{ fontSize: 15, color: 'var(--text2)', marginBottom: 24 }}>
          We found <strong>{jobs.length || '…'} jobs</strong> and <strong>{moduleCount} modules</strong> from your resume. You can fine-tune everything in your library — but first, let&apos;s put it to work.
        </p>

        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 28 }}>
          {jobs.length === 0 ? (
            <div style={{ padding: 18, fontSize: 13, color: 'var(--text3)' }}>Loading your library…</div>
          ) : (
            jobs.map(j => (
              <div key={j.id} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{j.title || 'Untitled role'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>{j.company}</div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>{j.module_count} module{j.module_count === 1 ? '' : 's'}</div>
              </div>
            ))
          )}
        </div>

        <button className="btn-primary" onClick={() => setStep(3)} style={{ display: 'inline-flex' }}>Generate My First Resume →</button>
      </div>
    )
  }

  if (step === 3) {
    return (
      <div>
        <StepBadge step={3} />
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Now let&apos;s tailor it for a real job.</h1>
        <p style={{ fontSize: 15, color: 'var(--text2)', marginBottom: 20 }}>
          Paste a job description below and we&apos;ll build a resume that speaks directly to that role — highlighting the experience that matters most for this position.
        </p>

        <textarea
          value={jdText}
          onChange={e => setJdText(e.target.value)}
          placeholder="Paste the full job description here — including the responsibilities and requirements sections for best results."
          style={{
            width: '100%', minHeight: 240, padding: 14, borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--surface)',
            fontSize: 14, fontFamily: 'inherit', color: 'var(--text)',
          }}
        />

        {error && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--rose)' }}>{error}</div>}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 }}>
          <button className="btn-ghost" onClick={() => setStep(2)} style={{ fontSize: 13 }}>← Back</button>
          <button
            className="btn-primary"
            onClick={runGeneration}
            disabled={jdText.trim().length < 50}
          >
            Generate Resume →
          </button>
        </div>

        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <a
            onClick={() => completeOnboarding('/dashboard')}
            style={{ fontSize: 13, color: 'var(--text3)', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Skip for now — I&apos;ll generate my first resume later
          </a>
        </div>
      </div>
    )
  }

  // Step 4: first resume reveal
  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Here&apos;s your tailored resume.</h1>
      <p style={{ fontSize: 15, color: 'var(--text2)', marginBottom: 28 }}>
        Generated from your modules, matched to the job description.
      </p>

      {atsScore !== null && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 12,
          padding: 28, textAlign: 'center', marginBottom: 24,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            Estimated ATS Match
          </div>
          <div style={{ fontSize: 64, fontWeight: 800, color: 'var(--teal)', lineHeight: 1 }}>{atsScore}</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 8 }}>
            Out of 100 · ATS systems vary by company
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24 }}>
        {downloadUrl && (
          <a className="btn-primary" href={downloadUrl} download={downloadFilename}>
            Download Resume
          </a>
        )}
        <button className="btn-ghost" onClick={() => completeOnboarding('/dashboard')}>
          Go to my dashboard →
        </button>
      </div>
    </div>
  )
}
