'use client'

// "Import from your ATS" on a posting: a candidate export file (CSV or Excel) plus resumes
// (a zip or the files themselves), or a direct pull from a connected ATS (see ats/registry.ts).
// Every candidate goes through one request at a time (3 in parallel) so large pipelines never hit
// the function time limit, and duplicates on the posting are skipped server-side.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'
import './ats-import.css'
import {
  ATS_KEYS,
  ATS_PRESETS,
  FIELD_LABELS,
  autoMap,
  isResumeFileName,
  matchResumes,
  rowsToCandidates,
  type AtsKey,
  type CandidateRow,
  type FieldKey,
  type Mapping,
} from '@/lib/business/ats-import'
import { PROVIDERS, PROVIDER_INFO, type Provider } from '@/lib/business/ats/registry'

type Props = { jobId: string; jobTitle: string; onClose: () => void; onImported: () => void }
type Direct = Provider
type IntStatus = {
  org_id?: string
  integrations: Record<Direct, { connected: boolean; writeback_enabled?: boolean; status?: string; can_comment?: boolean }>
  linked: { provider: string; external_id: string } | null
}
type DirectJob = { id: string | number; name: string; requisition_id: string | null }
// One shape for both providers: key = Greenhouse application id or Workable candidate id.
type DirectApplicant = {
  key: string; name: string | null; email: string | null; stage: string | null
  resume: { filename: string } | null; resumeUnknown: boolean; opted_out: boolean; already_imported: boolean
}
const DIRECT_LABEL = (p: Direct) => PROVIDER_INFO[p].label
const NOTE_WORD = (p: Direct) => PROVIDER_INFO[p].noteWord
type LogLine = { label: string; state: 'created' | 'duplicate' | 'skipped' | 'failed'; detail?: string }
type Task = { label: string; run: () => Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> }

const ATS_HINT: Record<AtsKey, string> = {
  greenhouse: 'Candidate export',
  lever: 'Candidate export',
  ashby: 'Candidate export',
  workable: 'Candidate export',
  bamboohr: 'Applicant export',
  adp: 'Applicant report',
  other: 'Any spreadsheet',
}
const MAPPABLE: FieldKey[] = ['fullName', 'firstName', 'lastName', 'email', 'externalId', 'stage', 'resumeFile', 'resumeText']
const MAX_ZIP = 300 * 1024 * 1024
const CONCURRENCY = 3

async function readSpreadsheet(file: File): Promise<{ headers: string[]; rows: Array<Record<string, unknown>> }> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xlsx')) {
    // The universal build parses on the main thread; the browser build spawns a blob: Web Worker,
    // which the app's CSP doesn't allow.
    const { readSheet } = await import('read-excel-file/universal')
    const data = (await readSheet(await file.arrayBuffer())) as unknown[][]
    const [head = [], ...body] = data
    const headers = head.map((h, i) => (h == null || String(h).trim() === '' ? `Column ${i + 1}` : String(h).trim()))
    const rows = body.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] instanceof Date ? (r[i] as Date).toISOString() : r[i]])))
    return { headers, rows }
  }
  if (name.endsWith('.csv') || name.endsWith('.tsv') || file.type.includes('csv')) {
    const text = await file.text()
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: 'greedy' })
    return { headers: (parsed.meta.fields ?? []).filter(Boolean), rows: parsed.data }
  }
  throw new Error('Use a CSV or Excel (.xlsx) file. Older .xls files: open and save as .xlsx or CSV first.')
}

async function filesFrom(list: File[]): Promise<File[]> {
  const out: File[] = []
  for (const f of list) {
    if (f.name.toLowerCase().endsWith('.zip')) {
      if (f.size > MAX_ZIP) throw new Error(`${f.name} is over 300 MB. Split it into smaller zips.`)
      const { unzipSync } = await import('fflate')
      const entries = unzipSync(new Uint8Array(await f.arrayBuffer()), { filter: (e) => isResumeFileName(e.name) && e.originalSize <= 10 * 1024 * 1024 })
      for (const [path, bytes] of Object.entries(entries)) {
        const base = path.split('/').pop()!
        const type = base.toLowerCase().endsWith('.pdf') ? 'application/pdf'
          : base.toLowerCase().endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'text/plain'
        out.push(new File([bytes as BlobPart], base, { type }))
      }
    } else if (isResumeFileName(f.name)) {
      out.push(f)
    }
  }
  return out
}

export default function AtsImport({ jobId, jobTitle, onClose, onImported }: Props) {
  const [mode, setMode] = useState<'pick' | 'file' | 'direct'>('pick')
  const [ats, setAts] = useState<AtsKey>('greenhouse')
  const [ints, setInts] = useState<IntStatus | null>(null)
  const [direct, setDirect] = useState<Direct>('greenhouse')
  const [error, setError] = useState('')

  // File flow
  const [sheetName, setSheetName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [mapping, setMapping] = useState<Mapping>({})
  const [resumeFiles, setResumeFiles] = useState<File[]>([])
  const [reading, setReading] = useState(false)
  const sheetInput = useRef<HTMLInputElement>(null)
  const resumeInput = useRef<HTMLInputElement>(null)

  // Direct (Greenhouse / Workable) flow
  const [ghJobs, setGhJobs] = useState<DirectJob[] | null>(null)
  const [ghJobId, setGhJobId] = useState<string>('')
  const [ghApplicants, setGhApplicants] = useState<DirectApplicant[] | null>(null)
  const [ghSelected, setGhSelected] = useState<Set<string>>(new Set())
  const [ghLoading, setGhLoading] = useState(false)

  // Shared run
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const [log, setLog] = useState<LogLine[]>([])
  const [stopReason, setStopReason] = useState('')
  const cancelRef = useRef(false)

  // Scores left this month (null = unlimited or unknown), from the plan usage the Settings page reads.
  const [remaining, setRemaining] = useState<number | null>(null)
  const [runRemaining, setRunRemaining] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)

  const loadUsage = useCallback((orgId: string | undefined) => {
    if (!orgId) return
    fetch(`/api/business/billing/usage?org_id=${orgId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { plan?: { monthlyScores: number | null }; usage?: { scoresThisMonth: number } } | null) => {
        const limit = d?.plan?.monthlyScores
        setRemaining(typeof limit === 'number' && d?.usage ? Math.max(0, limit - d.usage.scoresThisMonth) : null)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch(`/api/business/integrations?job_id=${jobId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { setInts(d); loadUsage(d?.org_id) })
      .catch(() => setInts(null))
  }, [jobId, loadUsage])

  useEffect(() => { closeRef.current?.focus() }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !running) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, running])

  const candidates = useMemo(() => rowsToCandidates(rows, mapping), [rows, mapping])
  const matches = useMemo(() => matchResumes(candidates, resumeFiles.map((f) => f.name)), [candidates, resumeFiles])
  const ready = candidates.filter((c, i) => c.resumeText || matches.has(i))
  const missing = candidates.length - ready.length

  async function onSheet(file: File | undefined) {
    if (!file) return
    setError(''); setReading(true)
    try {
      const { headers: h, rows: r } = await readSpreadsheet(file)
      if (!h.length || !r.length) throw new Error('That file has no rows to import.')
      if (r.length > 2000) throw new Error('That file has more than 2,000 rows. Filter it to the candidates you want to score.')
      setSheetName(file.name); setHeaders(h); setRows(r); setMapping(autoMap(h, ats))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setReading(false)
      if (sheetInput.current) sheetInput.current.value = ''
    }
  }

  async function onResumes(list: FileList | File[] | null) {
    if (!list?.length) return
    setError(''); setReading(true)
    try {
      const found = await filesFrom(Array.from(list))
      if (!found.length) throw new Error('No PDF, Word (.docx) or text resumes found in what you picked.')
      setResumeFiles((prev) => {
        const seen = new Set(prev.map((f) => `${f.name}:${f.size}`))
        return [...prev, ...found.filter((f) => !seen.has(`${f.name}:${f.size}`))]
      })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setReading(false)
      if (resumeInput.current) resumeInput.current.value = ''
    }
  }

  // Dropped files: the spreadsheet becomes the candidate export, everything else is resumes.
  async function onDropFiles(list: FileList) {
    setDragOver(false)
    const files = Array.from(list)
    if (!files.length || running) return
    setMode('file')
    const isSheet = (f: File) => /\.(csv|tsv|xlsx)$/i.test(f.name)
    const sheet = files.find(isSheet)
    const rest = files.filter((f) => f !== sheet)
    if (sheet) await onSheet(sheet)
    if (rest.length) await onResumes(rest)
  }
  const dropProps = {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragOver(true) },
    onDragLeave: () => setDragOver(false),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); onDropFiles(e.dataTransfer.files) },
  }

  async function runTasks(tasks: Task[]) {
    setRunRemaining(remaining)
    setRunning(true); setDone(0); setTotal(tasks.length); setLog([]); setStopReason(''); setError('')
    cancelRef.current = false
    let next = 0
    let stopped = ''
    const worker = async () => {
      while (!stopped && !cancelRef.current && next < tasks.length) {
        const t = tasks[next++]
        let line: LogLine
        try {
          const { ok, status, data } = await t.run()
          if (status === 402 || status === 429) {
            stopped = String(data.error ?? 'A limit was reached.')
            line = { label: t.label, state: 'failed', detail: 'Not imported (limit reached)' }
          } else if (!ok) {
            line = { label: t.label, state: 'failed', detail: String(data.error ?? `Error ${status}`) }
          } else if (data.status === 'duplicate') {
            line = { label: t.label, state: 'duplicate', detail: 'Already on this posting' }
          } else if (data.status === 'skipped') {
            line = { label: t.label, state: 'skipped', detail: String(data.reason ?? 'Skipped') }
          } else {
            const score = data.overall_score
            const label = DIRECT_LABEL(direct)
            const note = data.note_error ? ` · ${NOTE_WORD(direct)} to ${label} failed` : data.note_posted ? ` · score posted to ${label}` : ''
            line = { label: t.label, state: 'created', detail: `${typeof score === 'number' ? `${score}/100` : 'Scored'}${note}` }
          }
        } catch {
          line = { label: t.label, state: 'failed', detail: 'Network error' }
        }
        setLog((l) => [...l, line])
        setDone((d) => d + 1)
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, worker))
    if (stopped) setStopReason(stopped)
    else if (cancelRef.current) setStopReason('Stopped. Candidates already imported stay on the posting.')
    setRunning(false)
    onImported()
    loadUsage(ints?.org_id)
  }

  const post = async (url: string, body: BodyInit, json = false) => {
    const res = await fetch(url, { method: 'POST', body, headers: json ? { 'Content-Type': 'application/json' } : undefined })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, data }
  }

  function startFileImport() {
    const source = ats === 'other' ? 'other' : ats
    const tasks: Task[] = []
    candidates.forEach((c: CandidateRow, i) => {
      const fileIdx = matches.get(i)
      if (!c.resumeText && fileIdx === undefined) return
      tasks.push({
        label: c.name ?? c.email ?? `Row ${c.rowNum}`,
        run: () => {
          const fd = new FormData()
          fd.append('job_id', jobId)
          if (c.name) fd.append('name', c.name)
          if (c.email) fd.append('email', c.email)
          if (c.stage) fd.append('ats_stage', c.stage)
          fd.append('external_source', source)
          if (c.externalId) fd.append('external_id', c.externalId)
          if (fileIdx !== undefined) fd.append('file', resumeFiles[fileIdx])
          else if (c.resumeText) fd.append('resume_text', c.resumeText)
          return post('/api/business/applicants/import', fd)
        },
      })
    })
    runTasks(tasks)
  }

  async function openDirect(p: Direct) {
    if (p !== direct) { setGhJobs(null); setGhJobId(''); setGhApplicants(null); setGhSelected(new Set()) }
    setDirect(p); setMode('direct'); setError('')
    if (ghJobs && p === direct) return
    setGhLoading(true)
    try {
      const res = await fetch(`/api/business/integrations/${p}/jobs?job_id=${jobId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Could not load ${DIRECT_LABEL(p)} jobs`)
      setGhJobs(data.jobs)
      const linked = ints?.linked
      if (linked?.provider === p && data.jobs.some((j: DirectJob) => String(j.id) === linked.external_id)) {
        loadDirectApplicants(p, linked.external_id)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGhLoading(false)
    }
  }

  async function loadDirectApplicants(p: Direct, id: string) {
    setGhJobId(id); setGhApplicants(null); setGhSelected(new Set()); setError('')
    if (!id) return
    setGhLoading(true)
    try {
      const { ok, data } = await post(`/api/business/integrations/${p}/applicants`, JSON.stringify({ job_id: jobId, ats_job_id: id }), true)
      if (!ok) throw new Error(String(data.error ?? 'Could not load candidates'))
      type Raw = { key: string; name: string | null; email: string | null; stage: string | null; resume: { filename: string } | null; resume_unknown: boolean; opted_out: boolean; already_imported: boolean }
      const list: DirectApplicant[] = (data.applicants as Raw[]).map((a) => ({
        key: a.key, name: a.name, email: a.email, stage: a.stage, resume: a.resume,
        // Some ATS lists don't say whether there's a resume; it's checked at import.
        resumeUnknown: a.resume_unknown,
        opted_out: a.opted_out, already_imported: a.already_imported,
      }))
      setGhApplicants(list)
      setGhSelected(new Set(list.filter(canImport).map((a) => a.key)))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGhLoading(false)
    }
  }

  function canImport(a: DirectApplicant) {
    return (!!a.resume || a.resumeUnknown) && !a.opted_out && !a.already_imported
  }

  function startDirectImport() {
    const p = direct
    const tasks: Task[] = (ghApplicants ?? [])
      .filter((a) => ghSelected.has(a.key))
      .map((a) => ({
        label: a.name ?? a.email ?? `Candidate ${a.key}`,
        run: () => post(
          `/api/business/integrations/${p}/import`,
          JSON.stringify({ job_id: jobId, ats_job_id: ghJobId, key: a.key }),
          true,
        ),
      }))
    runTasks(tasks)
  }

  const counts = log.reduce((acc, l) => ({ ...acc, [l.state]: (acc[l.state] ?? 0) + 1 }), {} as Record<string, number>)
  const ghEligible = (ghApplicants ?? []).filter(canImport)
  const connected = PROVIDERS.filter((p) => ints?.integrations?.[p]?.connected)
  const dLabel = DIRECT_LABEL(direct)
  const dInfo = ints?.integrations?.[direct]
  const dWriteback = !!dInfo?.writeback_enabled && dInfo?.can_comment !== false
  const showRun = running || log.length > 0
  const flow: 'direct' | 'file' = mode === 'file' ? 'file' : mode === 'direct' ? 'direct' : connected.length ? 'direct' : 'file'
  const stepLabels = flow === 'direct'
    ? ['Source', 'Pick a job', 'Choose candidates', 'Import and score']
    : ['Source', 'Candidate file', 'Match resumes', 'Import and score']
  const stepAt = showRun ? (running ? 3 : 4) : mode === 'pick' ? 0 : mode === 'direct' ? (ghJobId ? 2 : 1) : (headers.length ? 2 : 1)
  const toScore = mode === 'file' ? ready.length : ghSelected.size
  const scoresLine = (n: number, left: number | null) => left === null || !n ? null
    : n > left
      ? `You have ${left} ${left === 1 ? 'score' : 'scores'} left this month. The import stops when they run out.`
      : `Uses up to ${n} of your ${left} remaining scores this month.`
  const already = (ghApplicants ?? []).filter((a) => a.already_imported).length
  const optedOut = (ghApplicants ?? []).filter((a) => a.opted_out).length
  const ghJobName = (ghJobs ?? []).find((j) => String(j.id) === ghJobId)?.name
  const otherAts = ats === 'other'

  return (
    <div className="ati-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !running) onClose() }}>
      <div className="ati" role="dialog" aria-modal="true" aria-labelledby="ati-title" aria-describedby="ati-desc">
        <header className="ati-head">
          <div className="ati-head-text">
            <h2 id="ati-title">Import from your ATS</h2>
            <p id="ati-desc">Into {jobTitle}. Every candidate is scored against this posting&apos;s criteria.</p>
          </div>
          <button ref={closeRef} type="button" className="ati-x" onClick={onClose} disabled={running} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </header>

        <ol className="ati-steps" aria-label="Steps">
          {stepLabels.map((label, i) => (
            <li key={label} className={i < stepAt ? 'done' : i === stepAt ? 'current' : ''} aria-current={i === stepAt ? 'step' : undefined}>
              <span className="ati-step-n" aria-hidden="true">
                {i < stepAt
                  ? <svg width="11" height="11" viewBox="0 0 12 12"><path d="M2.5 6.5l2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  : i + 1}
              </span>
              {label}
              {i < stepAt && <span className="sr-only"> (done)</span>}
            </li>
          ))}
        </ol>

        <div className="ati-cols">
          <aside className="ati-side" aria-label="Source">
            <span className="ati-eyebrow">Connected</span>
            {connected.length ? connected.map((p) => {
              const st = ints?.integrations[p]
              const selected = mode === 'direct' && direct === p
              const detail = selected && ghJobName ? `Job: ${ghJobName}`
                : st?.status === 'error' ? 'Needs attention in Settings'
                : ints?.linked?.provider === p ? 'Linked to this posting'
                : 'Pull candidates from a job'
              return (
                <button key={p} type="button" className="ati-src" aria-pressed={selected} disabled={running} onClick={() => openDirect(p)}>
                  <span className="ati-av" aria-hidden="true">{DIRECT_LABEL(p).charAt(0)}</span>
                  <span className="ati-src-text"><b>{DIRECT_LABEL(p)}</b><small>{detail}</small></span>
                </button>
              )
            }) : (
              <p className="ati-side-note">
                No ATS connected yet. <a href="/business/settings?tab=integrations">Connect one in Settings</a> to pull candidates without files.
              </p>
            )}
            <span className="ati-eyebrow later">Or upload an export</span>
            <button
              type="button"
              className={`ati-drop${dragOver ? ' over' : ''}`}
              aria-pressed={mode === 'file'}
              disabled={running}
              onClick={() => { setError(''); setMode('file') }}
              {...dropProps}
            >
              <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><path d="M11 15V4M6.5 8.5L11 4l4.5 4.5M4 15v3h14v-3" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <strong>Drop a CSV or .xlsx</strong>
              <span>plus a .zip of resumes. Workable, Ashby, BambooHR, ADP and others.</span>
            </button>
          </aside>

          <section className="ati-main" aria-labelledby="ati-step-h">
            {error && <div className="ati-error" role="alert">{error}</div>}

            {showRun ? (
              <>
                <div className="ati-title-row">
                  <h3 id="ati-step-h" className="ati-h3">{running ? 'Importing and scoring' : 'Import finished'}</h3>
                </div>
                <div className="ati-progress">
                  <div className="ati-progress-row"><b>{running ? 'Importing and scoring' : 'Done'}</b><span>{done} of {total}</span></div>
                  <div className="ati-bar" role="progressbar" aria-label="Import progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
                    <i style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
                  </div>
                  {running && scoresLine(total, runRemaining) && <small>{scoresLine(total, runRemaining)}</small>}
                </div>
                <div className="ati-stats">
                  <div className="ati-stat"><b className="ati-ok">{counts.created ?? 0}</b><span>scored and added</span></div>
                  <div className="ati-stat"><b>{(counts.duplicate ?? 0) + (counts.skipped ?? 0)}</b><span>already here or skipped</span></div>
                  <div className="ati-stat"><b className={counts.failed ? 'ati-bad' : ''}>{counts.failed ?? 0}</b><span>failed</span></div>
                </div>
                {stopReason && <div className="ati-sand" role="status">{stopReason}</div>}
                {running && <p className="ati-note">Keep this tab open. Each candidate takes a few seconds to score.</p>}
                {log.length > 0 && (
                  <div className="ati-log" aria-live="polite">
                    {log.map((l, i) => (
                      <div key={i}>
                        <span>{l.label}</span>
                        <span className={l.state === 'created' ? 'ati-ok' : l.state === 'failed' ? 'ati-bad' : 'ati-warn'}>{l.detail}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : mode === 'pick' ? (
              <>
                <h3 id="ati-step-h" className="ati-h3">Where are the candidates now?</h3>
                <p className="ati-lead">
                  {connected.length
                    ? 'Pick a connected ATS on the left to pull candidates and resumes straight from a job, or import an export file from any ATS.'
                    : 'Import a candidate export from your ATS with their resumes. We match each resume to a candidate before anything is scored.'}
                </p>
                <span className="ati-eyebrow">Export file from</span>
                <div className="ati-tiles">
                  {ATS_KEYS.map((k) => (
                    <button key={k} type="button" className="ati-tile" aria-pressed={ats === k} onClick={() => setAts(k)}>
                      <b>{ATS_PRESETS[k].label}</b>
                      <small>{ATS_HINT[k]}</small>
                    </button>
                  ))}
                </div>
                <p className="ati-note">
                  Export your candidates from {otherAts ? 'your system' : ATS_PRESETS[ats].label} as a CSV or Excel file, and download their resumes (a zip is fine). We match each resume to a candidate by its file name, email, candidate ID or name, and you can check the match before anything is scored.
                  {(PROVIDERS as string[]).includes(ats) && !ints?.integrations?.[ats as Direct]?.connected && (
                    <> Using {DIRECT_LABEL(ats as Direct)}? You can also <a href="/business/settings?tab=integrations">connect it in Settings</a> and skip the files.</>
                  )}
                </p>
              </>
            ) : mode === 'file' ? (
              <>
                <div className="ati-title-row">
                  <h3 id="ati-step-h" className="ati-h3">Candidate export</h3>
                  <span className="ati-aside">From {otherAts ? 'another ATS or a spreadsheet' : ATS_PRESETS[ats].label}</span>
                </div>
                <input ref={sheetInput} type="file" accept=".csv,.tsv,.xlsx,text/csv" hidden onChange={(e) => onSheet(e.target.files?.[0])} />
                <input ref={resumeInput} type="file" accept=".zip,.pdf,.docx,.txt" multiple hidden onChange={(e) => onResumes(e.target.files)} />
                <div className="ati-grid">
                  <button type="button" className={`ati-drop${headers.length ? ' has' : ''}`} onClick={() => sheetInput.current?.click()} {...dropProps}>
                    <strong>{sheetName || '1. Candidate export'}</strong>
                    <span>{headers.length ? `${rows.length} rows · click to replace` : 'CSV or Excel (.xlsx)'}</span>
                  </button>
                  <button type="button" className={`ati-drop${resumeFiles.length ? ' has' : ''}`} onClick={() => resumeInput.current?.click()} {...dropProps}>
                    <strong>{resumeFiles.length ? `${resumeFiles.length} resumes` : '2. Resumes'}</strong>
                    <span>{resumeFiles.length ? 'Click to add more' : 'A .zip, or PDF and Word files'}</span>
                  </button>
                </div>
                {reading && <p className="ati-note" role="status">Reading files…</p>}

                {headers.length > 0 && (
                  <>
                    <span className="ati-eyebrow">Columns</span>
                    <div className="ati-grid">
                      {MAPPABLE.map((f) => (
                        <label key={f} className="ati-field">
                          {FIELD_LABELS[f]}
                          <select value={mapping[f] ?? ''} onChange={(e) => setMapping((m) => ({ ...m, [f]: e.target.value || undefined }))}>
                            <option value="">Not in this file</option>
                            {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </label>
                      ))}
                    </div>
                    <div className="ati-stats">
                      <div className="ati-stat"><b>{candidates.length}</b><span>candidates</span></div>
                      <div className="ati-stat"><b className="ati-ok">{ready.length}</b><span>with a resume, will be scored</span></div>
                      <div className="ati-stat"><b className={missing ? 'ati-warn' : ''}>{missing}</b><span>no resume found, skipped</span></div>
                    </div>
                    {candidates.length > 0 && (
                      <>
                        <div className="ati-table-wrap">
                          <table className="ati-table">
                            <thead><tr><th>Name</th><th>Email</th><th>Stage</th><th>Resume</th></tr></thead>
                            <tbody>
                              {candidates.slice(0, 8).map((c, i) => (
                                <tr key={c.rowNum}>
                                  <td>{c.name ?? '–'}</td>
                                  <td>{c.email ?? '–'}</td>
                                  <td>{c.stage ?? '–'}</td>
                                  <td>
                                    <span className={`ati-pill${c.resumeText || matches.has(i) ? ' ok' : ''}`}>
                                      {matches.has(i) ? resumeFiles[matches.get(i)!].name : c.resumeText ? 'Text in file' : 'No resume'}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {candidates.length > 8 && <p className="ati-note">And {candidates.length - 8} more.</p>}
                      </>
                    )}
                    {!mapping.email && !mapping.externalId && (
                      <div className="ati-sand">Map an Email or Candidate ID column if you can: it&apos;s how a second import knows who is already here.</div>
                    )}
                  </>
                )}

                <p className="ati-note">
                  Candidates are scored by AI against this posting&apos;s criteria. Each one counts toward your plan&apos;s monthly scores; people already on this posting are skipped for free.
                </p>
              </>
            ) : (
              <>
                <label className="ati-field">
                  {dLabel} job
                  <select value={ghJobId} onChange={(e) => loadDirectApplicants(direct, e.target.value)} disabled={ghLoading || !ghJobs}>
                    <option value="">{ghJobs ? 'Pick an open job' : 'Loading jobs…'}</option>
                    {(ghJobs ?? []).map((j) => <option key={j.id} value={j.id}>{j.name}{j.requisition_id ? ` (${j.requisition_id})` : ''}</option>)}
                  </select>
                </label>
                {!ghApplicants && <h3 id="ati-step-h" className="ati-h3">{ghLoading && ghJobId ? `Loading candidates from ${dLabel}…` : `Pick a ${dLabel} job`}</h3>}
                {ghApplicants && (
                  <>
                    <div className="ati-title-row">
                      <h3 id="ati-step-h" className="ati-h3">
                        {ghApplicants.length} {ghApplicants.length === 1 ? 'candidate' : 'candidates'}
                      </h3>
                      {already > 0 && <span className="ati-aside">{already} already on this posting, skipped</span>}
                    </div>
                    {PROVIDER_INFO[direct].hasOptOut && (
                      <div className="ati-sand">
                        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5" fill="none" /><path d="M9 5.5v4M9 12v.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                        <span>
                          {optedOut
                            ? `${optedOut} ${optedOut === 1 ? 'candidate' : 'candidates'} opted out of AI review in ${dLabel}. They won't be imported or scored.`
                            : `Candidates who opted out of AI review in ${dLabel} are never imported or scored.`}
                        </span>
                      </div>
                    )}
                    {ghApplicants.length === 0 ? (
                      <p className="ati-note">No active candidates on this {dLabel} job.</p>
                    ) : (
                      <div className="ati-list">
                        <label className="ati-row all">
                          <input
                            type="checkbox"
                            checked={ghEligible.length > 0 && ghEligible.every((a) => ghSelected.has(a.key))}
                            disabled={!ghEligible.length}
                            onChange={(e) => setGhSelected(e.target.checked ? new Set(ghEligible.map((a) => a.key)) : new Set())}
                          />
                          <span className="ati-row-name">Select all {ghEligible.length} new</span>
                          <span className="ati-row-stage">{ghSelected.size} selected</span>
                        </label>
                        {ghApplicants.map((a) => {
                          const blocked = a.opted_out ? 'Opted out' : a.already_imported ? 'Already here' : !a.resume && !a.resumeUnknown ? 'No resume' : ''
                          return (
                            <label key={a.key} className={`ati-row${blocked ? ' blocked' : ''}`}>
                              <input
                                type="checkbox"
                                disabled={!!blocked}
                                checked={ghSelected.has(a.key)}
                                onChange={(e) => setGhSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(a.key); else n.delete(a.key); return n })}
                              />
                              <span className="ati-row-name">{a.name ?? a.email ?? 'Unnamed'}</span>
                              {a.stage && <span className="ati-row-stage">{a.stage}</span>}
                              <span className={`ati-pill${blocked ? '' : a.resumeUnknown ? '' : ' ok'}`} title={a.resume?.filename}>
                                {blocked || (a.resumeUnknown ? 'Checked at import' : 'Resume')}
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    )}
                    <p className="ati-note">
                      {PROVIDER_INFO[direct].activeMeans}{' '}
                      {dWriteback
                        ? `Each score is posted back to the candidate in ${dLabel} as a ${NOTE_WORD(direct)}.`
                        : <>Scores aren&apos;t posted back to {dLabel}. <a href="/business/settings?tab=integrations">Change this in Settings</a>.</>}
                    </p>
                  </>
                )}
              </>
            )}
          </section>
        </div>

        <footer className="ati-foot">
          {!showRun && mode !== 'pick' && scoresLine(toScore, remaining) && <span className="ati-foot-note">{scoresLine(toScore, remaining)}</span>}
          {showRun ? (
            <>
              {running && <button type="button" className="biz-btn biz-btn-ghost" onClick={() => { cancelRef.current = true }}>Stop</button>}
              <button type="button" className="biz-btn" disabled={running} onClick={onClose}>See ranked list</button>
            </>
          ) : mode === 'pick' ? (
            <>
              <button type="button" className="biz-btn biz-btn-ghost" onClick={onClose}>Cancel</button>
              <button type="button" className="biz-btn" onClick={() => setMode('file')}>Continue with a file</button>
            </>
          ) : (
            <>
              <button type="button" className="biz-btn biz-btn-ghost" onClick={() => { setError(''); setMode('pick') }}>Back</button>
              {mode === 'file' ? (
                <button type="button" className="biz-btn" disabled={!ready.length || reading} onClick={startFileImport}>
                  Import and score {ready.length || ''}
                </button>
              ) : (
                <button type="button" className="biz-btn" disabled={!ghSelected.size || ghLoading} onClick={startDirectImport}>
                  Import and score {ghSelected.size || ''}
                </button>
              )}
            </>
          )}
        </footer>
      </div>
    </div>
  )
}
