'use client'

// "Import from your ATS" on a posting: a candidate export file (CSV or Excel) plus resumes
// (a zip or the files themselves), or a direct Greenhouse pull when the org has connected it.
// Every candidate goes through one request at a time (3 in parallel) so large pipelines never hit
// the function time limit, and duplicates on the posting are skipped server-side.
import { useEffect, useMemo, useRef, useState } from 'react'
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

type Props = { jobId: string; jobTitle: string; onClose: () => void; onImported: () => void }
type GhStatus = { connected: boolean; can_manage: boolean; status: string | null; last_error: string | null; linked_gh_job_id: string | null; writeback_enabled: boolean }
type GhJob = { id: number; name: string; requisition_id: string | null }
type GhApplicant = {
  application_id: number; candidate_id: number; name: string | null; email: string | null; stage: string | null
  resume: { filename: string } | null; opted_out: boolean; already_imported: boolean
}
type LogLine = { label: string; state: 'created' | 'duplicate' | 'skipped' | 'failed'; detail?: string }
type Task = { label: string; run: () => Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> }

const ATS_HINT: Record<AtsKey, string> = {
  greenhouse: 'Candidate export',
  lever: 'Candidate export',
  ashby: 'Candidate export',
  workable: 'Candidate export',
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
  const [mode, setMode] = useState<'pick' | 'file' | 'greenhouse'>('pick')
  const [ats, setAts] = useState<AtsKey>('greenhouse')
  const [gh, setGh] = useState<GhStatus | null>(null)
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

  // Greenhouse flow
  const [ghJobs, setGhJobs] = useState<GhJob[] | null>(null)
  const [ghJobId, setGhJobId] = useState<string>('')
  const [ghApplicants, setGhApplicants] = useState<GhApplicant[] | null>(null)
  const [ghSelected, setGhSelected] = useState<Set<number>>(new Set())
  const [ghLoading, setGhLoading] = useState(false)

  // Shared run
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const [log, setLog] = useState<LogLine[]>([])
  const [stopReason, setStopReason] = useState('')
  const cancelRef = useRef(false)

  useEffect(() => {
    fetch(`/api/business/integrations/greenhouse?job_id=${jobId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setGh(d))
      .catch(() => setGh(null))
  }, [jobId])

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

  async function onResumes(list: FileList | null) {
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

  async function runTasks(tasks: Task[]) {
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
            const note = data.note_error ? ' · note to Greenhouse failed' : data.note_posted ? ' · score posted to Greenhouse' : ''
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

  async function openGreenhouse() {
    setMode('greenhouse'); setError('')
    if (ghJobs) return
    setGhLoading(true)
    try {
      const res = await fetch(`/api/business/integrations/greenhouse/jobs?job_id=${jobId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not load Greenhouse jobs')
      setGhJobs(data.jobs)
      if (gh?.linked_gh_job_id && data.jobs.some((j: GhJob) => String(j.id) === gh.linked_gh_job_id)) {
        setGhJobId(gh.linked_gh_job_id)
        loadGhApplicants(gh.linked_gh_job_id)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGhLoading(false)
    }
  }

  async function loadGhApplicants(id: string) {
    setGhJobId(id); setGhApplicants(null); setGhSelected(new Set()); setError('')
    if (!id) return
    setGhLoading(true)
    try {
      const { ok, data } = await post('/api/business/integrations/greenhouse/applicants', JSON.stringify({ job_id: jobId, gh_job_id: Number(id) }), true)
      if (!ok) throw new Error(String(data.error ?? 'Could not load candidates'))
      const list = data.applicants as GhApplicant[]
      setGhApplicants(list)
      setGhSelected(new Set(list.filter((a) => a.resume && !a.opted_out && !a.already_imported).map((a) => a.application_id)))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGhLoading(false)
    }
  }

  function startGreenhouseImport() {
    const tasks: Task[] = (ghApplicants ?? [])
      .filter((a) => ghSelected.has(a.application_id))
      .map((a) => ({
        label: a.name ?? a.email ?? `Application ${a.application_id}`,
        run: () => post('/api/business/integrations/greenhouse/import', JSON.stringify({ job_id: jobId, gh_job_id: Number(ghJobId), application_id: a.application_id }), true),
      }))
    runTasks(tasks)
  }

  const counts = log.reduce((acc, l) => ({ ...acc, [l.state]: (acc[l.state] ?? 0) + 1 }), {} as Record<string, number>)
  const ghEligible = (ghApplicants ?? []).filter((a) => a.resume && !a.opted_out && !a.already_imported)
  const showRun = running || log.length > 0

  return (
    <div className="ati-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !running) onClose() }}>
      <div className="ati" role="dialog" aria-modal="true" aria-labelledby="ati-title">
        <div className="ati-head">
          <div>
            <h2 id="ati-title">Import from your ATS</h2>
            <p>Bring your current candidates for {jobTitle} into ModuleHire and score them against this posting.</p>
          </div>
          <button className="ati-x" onClick={onClose} disabled={running} aria-label="Close">×</button>
        </div>

        <div className="ati-body">
          {error && <div className="ati-error" role="alert">{error}</div>}

          {showRun ? (
            <>
              <div>
                <div className="ati-label">{running ? `Importing ${done} of ${total}…` : 'Import finished'}</div>
                <div className="ati-bar"><i style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
              </div>
              <div className="ati-stats">
                <div className="ati-stat"><b className="ati-ok">{counts.created ?? 0}</b><span>scored and added</span></div>
                <div className="ati-stat"><b>{(counts.duplicate ?? 0) + (counts.skipped ?? 0)}</b><span>already here or skipped</span></div>
                <div className="ati-stat"><b className={counts.failed ? 'ati-bad' : ''}>{counts.failed ?? 0}</b><span>failed</span></div>
              </div>
              {stopReason && <div className="ati-note">{stopReason}</div>}
              {running && <div className="ati-note">Keep this tab open. Each candidate takes a few seconds to score.</div>}
              <div className="ati-log" aria-live="polite">
                {log.map((l, i) => (
                  <div key={i}>
                    <span>{l.label}</span>
                    <span className={l.state === 'created' ? 'ati-ok' : l.state === 'failed' ? 'ati-bad' : 'ati-warn'}>{l.detail}</span>
                  </div>
                ))}
              </div>
              <div className="ati-actions">
                {running
                  ? <button className="ati-btn ghost" onClick={() => { cancelRef.current = true }}>Stop</button>
                  : <button className="ati-btn" onClick={onClose}>Done</button>}
              </div>
            </>
          ) : mode === 'pick' ? (
            <>
              {gh?.connected && (
                <div className="ati-direct">
                  <div>
                    <b>Greenhouse is connected</b>
                    Pull candidates and resumes straight from a Greenhouse job{gh.writeback_enabled ? ', and post each score back as a note' : ''}.
                  </div>
                  <button className="ati-btn" onClick={openGreenhouse}>Pull from Greenhouse</button>
                </div>
              )}
              <div>
                <div className="ati-label">{gh?.connected ? 'Or import an export file from' : 'Where are the candidates now?'}</div>
                <div className="ati-tiles">
                  {ATS_KEYS.map((k) => (
                    <button key={k} type="button" className="ati-tile" aria-pressed={ats === k} onClick={() => setAts(k)}>
                      <b>{ATS_PRESETS[k].label}</b>
                      <small>{ATS_HINT[k]}</small>
                    </button>
                  ))}
                </div>
              </div>
              <div className="ati-note">
                Export your candidates from {ATS_PRESETS[ats].label === 'Another ATS or a spreadsheet' ? 'your system' : ATS_PRESETS[ats].label} as a CSV or Excel file, and download their resumes (a zip is fine). We match each resume to a candidate by its file name, email, candidate ID or name, and you can check the match before anything is scored.
                {!gh?.connected && ats === 'greenhouse' && (
                  <> Using Greenhouse? You can also <a href="/business/settings#integrations">connect it in Settings</a> and skip the files.</>
                )}
              </div>
              <div className="ati-actions">
                <button className="ati-btn ghost" onClick={onClose}>Cancel</button>
                <button className="ati-btn" onClick={() => setMode('file')}>Continue</button>
              </div>
            </>
          ) : mode === 'file' ? (
            <>
              <div className="ati-steps"><span className="on">{ATS_PRESETS[ats].label}</span><span className={headers.length ? 'on' : ''}>Candidates</span><span className={resumeFiles.length ? 'on' : ''}>Resumes</span></div>
              <input ref={sheetInput} type="file" accept=".csv,.tsv,.xlsx,text/csv" hidden onChange={(e) => onSheet(e.target.files?.[0])} />
              <input ref={resumeInput} type="file" accept=".zip,.pdf,.docx,.txt" multiple hidden onChange={(e) => onResumes(e.target.files)} />
              <div className="ati-grid">
                <div className={`ati-drop${headers.length ? ' has' : ''}`} role="button" tabIndex={0} onClick={() => sheetInput.current?.click()} onKeyDown={(e) => e.key === 'Enter' && sheetInput.current?.click()}>
                  <strong>{sheetName || '1. Candidate export'}</strong>
                  <span>{headers.length ? `${rows.length} rows · click to replace` : 'CSV or Excel (.xlsx)'}</span>
                </div>
                <div className={`ati-drop${resumeFiles.length ? ' has' : ''}`} role="button" tabIndex={0} onClick={() => resumeInput.current?.click()} onKeyDown={(e) => e.key === 'Enter' && resumeInput.current?.click()}>
                  <strong>{resumeFiles.length ? `${resumeFiles.length} resumes` : '2. Resumes'}</strong>
                  <span>{resumeFiles.length ? 'Click to add more' : 'A .zip, or PDF and Word files'}</span>
                </div>
              </div>
              {reading && <div className="ati-note">Reading files…</div>}

              {headers.length > 0 && (
                <>
                  <div>
                    <div className="ati-label">Columns</div>
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
                  </div>
                  <div className="ati-stats">
                    <div className="ati-stat"><b>{candidates.length}</b><span>candidates</span></div>
                    <div className="ati-stat"><b className="ati-ok">{ready.length}</b><span>with a resume, will be scored</span></div>
                    <div className="ati-stat"><b className={missing ? 'ati-warn' : ''}>{missing}</b><span>no resume found, skipped</span></div>
                  </div>
                  {candidates.length > 0 && (
                    <div style={{ overflowX: 'auto' }}>
                      <table className="ati-table">
                        <thead><tr><th>Name</th><th>Email</th><th>Stage</th><th>Resume</th></tr></thead>
                        <tbody>
                          {candidates.slice(0, 8).map((c, i) => (
                            <tr key={c.rowNum}>
                              <td>{c.name ?? '–'}</td>
                              <td>{c.email ?? '–'}</td>
                              <td>{c.stage ?? '–'}</td>
                              <td className={c.resumeText || matches.has(i) ? 'ati-ok' : 'ati-warn'}>
                                {matches.has(i) ? resumeFiles[matches.get(i)!].name : c.resumeText ? 'Text in file' : 'Not found'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {candidates.length > 8 && <div className="ati-note" style={{ marginTop: 8 }}>And {candidates.length - 8} more.</div>}
                    </div>
                  )}
                  {!mapping.email && !mapping.externalId && (
                    <div className="ati-note">Map an Email or Candidate ID column if you can: it&apos;s how a second import knows who is already here.</div>
                  )}
                </>
              )}

              <div className="ati-note">
                Candidates are scored by AI against this posting&apos;s criteria. Each one counts toward your plan&apos;s monthly scores; people already on this posting are skipped for free.
              </div>
              <div className="ati-actions">
                <button className="ati-btn ghost" onClick={() => setMode('pick')}>Back</button>
                <button className="ati-btn" disabled={!ready.length || reading} onClick={startFileImport}>
                  Import and score {ready.length || ''}
                </button>
              </div>
            </>
          ) : (
            <>
              <label className="ati-field">
                Greenhouse job
                <select value={ghJobId} onChange={(e) => loadGhApplicants(e.target.value)} disabled={ghLoading || !ghJobs}>
                  <option value="">{ghJobs ? 'Pick an open job' : 'Loading jobs…'}</option>
                  {(ghJobs ?? []).map((j) => <option key={j.id} value={j.id}>{j.name}{j.requisition_id ? ` (${j.requisition_id})` : ''}</option>)}
                </select>
              </label>
              {ghLoading && ghJobId && <div className="ati-note">Loading candidates from Greenhouse…</div>}
              {ghApplicants && (
                ghApplicants.length === 0 ? (
                  <div className="ati-note">No active candidates on this Greenhouse job.</div>
                ) : (
                  <>
                    <div className="ati-stats">
                      <div className="ati-stat"><b>{ghApplicants.length}</b><span>active in Greenhouse</span></div>
                      <div className="ati-stat"><b className="ati-ok">{ghSelected.size}</b><span>selected to score</span></div>
                      <div className="ati-stat"><b>{ghApplicants.filter((a) => a.opted_out).length}</b><span>opted out of AI review</span></div>
                    </div>
                    <label className="ati-check">
                      <input
                        type="checkbox"
                        checked={ghEligible.length > 0 && ghEligible.every((a) => ghSelected.has(a.application_id))}
                        onChange={(e) => setGhSelected(e.target.checked ? new Set(ghEligible.map((a) => a.application_id)) : new Set())}
                      />
                      Select everyone who can be scored
                    </label>
                    <div style={{ overflowX: 'auto', maxHeight: 280 }}>
                      <table className="ati-table">
                        <thead><tr><th /><th>Name</th><th>Stage</th><th>Resume</th></tr></thead>
                        <tbody>
                          {ghApplicants.map((a) => {
                            const blocked = a.opted_out ? 'Opted out of AI review' : a.already_imported ? 'Already here' : !a.resume ? 'No resume' : ''
                            return (
                              <tr key={a.application_id}>
                                <td>
                                  <input
                                    type="checkbox"
                                    aria-label={`Import ${a.name ?? 'candidate'}`}
                                    disabled={!!blocked}
                                    checked={ghSelected.has(a.application_id)}
                                    onChange={(e) => setGhSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(a.application_id); else n.delete(a.application_id); return n })}
                                  />
                                </td>
                                <td>{a.name ?? a.email ?? 'Unnamed'}</td>
                                <td>{a.stage ?? '–'}</td>
                                <td className={blocked ? 'ati-warn' : 'ati-ok'}>{blocked || a.resume?.filename}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="ati-note">
                      Candidates who opted out of AI review in Greenhouse are never imported or scored.
                      {gh?.writeback_enabled ? ' Each score is posted back to the candidate in Greenhouse as a note.' : ''}
                    </div>
                  </>
                )
              )}
              <div className="ati-actions">
                <button className="ati-btn ghost" onClick={() => setMode('pick')}>Back</button>
                <button className="ati-btn" disabled={!ghSelected.size || ghLoading} onClick={startGreenhouseImport}>
                  Import and score {ghSelected.size || ''}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
