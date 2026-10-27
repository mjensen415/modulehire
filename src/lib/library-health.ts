// Finds old parse damage in a user's library and plans the fix. Pure: the admin routes load the
// rows, call these, and hand an approved plan to the apply_library_repair SQL function (one
// transaction, audited, undoable). Nothing here ever runs automatically.
import { normalizeCompany, parseResumeDate, isPresentDate } from './resume-dates'
import type { OutlineRole } from './parse-modules'

export type HealthModule = {
  id: string
  title: string | null
  content: string | null
  source_company: string | null
  source_role_title: string | null
  date_start: string | null
  date_end: string | null
  type: string
  updated_at: string
}
export type HealthJob = { id: string; company: string; title: string | null; start_date: string | null; end_date: string | null }
export type HealthLink = { module_id: string; job_id: string }

export type RepairOp =
  | { op: 'link'; module_id: string; job_id: string; why: string }
  | { op: 'hide'; module_id: string; kept_id: string; why: string }
  | { op: 'positioning'; module_id: string; why: string }
  | { op: 'job_dates'; job_id: string; start_date: string | null; end_date: string | null; why: string }

export type HealthReport = {
  modules: number
  jobs: number
  unlinked: string[]
  multiCompany: string[]
  duplicates: { keep: string; hide: string[] }[]
  wideJobs: { job_id: string; job: string; dates: string; modules: string }[]
}

// A company field that names no single employer.
export function isMultiCompany(company: string | null): boolean {
  if (!company) return false
  return /[,;]/.test(company) || /^(multiple|various|career|professional|self)\b/i.test(company.trim())
}

const monthKey = (d: string | null | undefined): number | null => {
  const p = parseResumeDate(d ?? '')
  return p ? p.year * 12 + (p.month ?? 0) : null
}
const fmt = (d: string | null | undefined) => (isPresentDate(d) || !d ? 'Present' : d.replace(/-01$/, ''))
const jobLabel = (j: HealthJob) => `${j.company}${j.title ? ` — ${j.title}` : ''}`

export function analyzeLibrary(modules: HealthModule[], jobs: HealthJob[], links: HealthLink[]): HealthReport {
  const jobIds = new Set(jobs.map(j => j.id))
  const linked = new Set(links.filter(l => jobIds.has(l.job_id)).map(l => l.module_id))

  const multiCompany = modules.filter(m => isMultiCompany(m.source_company)).map(m => m.id)
  const multiSet = new Set(multiCompany)
  // Positioning modules are career-level by design; they're not "unlinked" damage.
  const unlinked = modules.filter(m => !linked.has(m.id) && m.type !== 'positioning' && !multiSet.has(m.id)).map(m => m.id)

  // Same title within the same company: keep the linked one, then the fullest, then the newest.
  const groups = new Map<string, HealthModule[]>()
  for (const m of modules) {
    const title = (m.title ?? '').trim().toLowerCase()
    if (!title) continue
    const key = `${normalizeCompany(m.source_company)}||${title}`
    groups.set(key, [...(groups.get(key) ?? []), m])
  }
  const duplicates: HealthReport['duplicates'] = []
  for (const copies of groups.values()) {
    if (copies.length < 2) continue
    const ranked = [...copies].sort((a, b) =>
      Number(linked.has(b.id)) - Number(linked.has(a.id)) ||
      (b.content ?? '').length - (a.content ?? '').length ||
      b.updated_at.localeCompare(a.updated_at))
    duplicates.push({ keep: ranked[0].id, hide: ranked.slice(1).map(m => m.id) })
  }

  // Job records whose dates are wider than the modules linked to them (dates widened across
  // merged modules by older parses).
  const byId = new Map(modules.map(m => [m.id, m]))
  const wideJobs: HealthReport['wideJobs'] = []
  for (const job of jobs) {
    const mods = links.filter(l => l.job_id === job.id).map(l => byId.get(l.module_id)).filter((m): m is HealthModule => !!m)
    const starts = mods.map(m => monthKey(m.date_start)).filter((k): k is number => k !== null)
    if (starts.length === 0) continue
    const modStart = Math.min(...starts)
    const anyOpen = mods.some(m => !m.date_end || isPresentDate(m.date_end))
    const ends = mods.map(m => monthKey(m.date_end)).filter((k): k is number => k !== null)
    const modEnd = anyOpen ? Infinity : (ends.length ? Math.max(...ends) : Infinity)
    const jobStart = monthKey(job.start_date)
    const jobEnd = isPresentDate(job.end_date) || !job.end_date ? Infinity : monthKey(job.end_date)
    const wider = (jobStart !== null && jobStart < modStart) || (jobEnd !== null && jobEnd > modEnd)
    if (wider) {
      const modStartStr = mods.map(m => m.date_start).filter(Boolean).sort()[0] ?? ''
      wideJobs.push({ job_id: job.id, job: jobLabel(job), dates: `${fmt(job.start_date)} to ${fmt(job.end_date)}`, modules: `${modStartStr.slice(0, 7)} to ${anyOpen ? 'Present' : (mods.map(m => m.date_end).filter(Boolean).sort().at(-1) ?? '').slice(0, 7)}` })
    }
  }

  return { modules: modules.length, jobs: jobs.length, unlinked, multiCompany, duplicates, wideJobs }
}

/**
 * The fix, op by op, for an admin to review before applying:
 *   - link unlinked modules to the one job at the same normalized company (title, then dates,
 *     break ties; ambiguous ones are left alone)
 *   - hide duplicate copies, keeping the linked/fullest one
 *   - turn multi-company modules into career-level positioning modules
 *   - reset job dates from the resume outline, where the outline has the job
 */
export function planRepair(report: HealthReport, modules: HealthModule[], jobs: HealthJob[], outline: OutlineRole[] = []): RepairOp[] {
  const byId = new Map(modules.map(m => [m.id, m]))
  const ops: RepairOp[] = []
  const hidden = new Set(report.duplicates.flatMap(d => d.hide))

  for (const id of report.unlinked) {
    if (hidden.has(id)) continue
    const m = byId.get(id)
    const company = normalizeCompany(m?.source_company)
    if (!m || !company) continue
    let candidates = jobs.filter(j => normalizeCompany(j.company) === company)
    if (candidates.length > 1) {
      const role = (m.source_role_title ?? '').trim().toLowerCase()
      const byTitle = candidates.filter(j => (j.title ?? '').trim().toLowerCase() === role)
      if (byTitle.length >= 1) candidates = byTitle
    }
    if (candidates.length > 1) {
      const start = monthKey(m.date_start)
      const within = start === null ? [] : candidates.filter(j => {
        const js = monthKey(j.start_date), je = isPresentDate(j.end_date) || !j.end_date ? Infinity : monthKey(j.end_date)
        return js !== null && js <= start && (je ?? Infinity) >= start
      })
      if (within.length === 1) candidates = within
    }
    if (candidates.length !== 1) continue
    ops.push({ op: 'link', module_id: id, job_id: candidates[0].id, why: `"${m.title}" → ${jobLabel(candidates[0])}` })
  }

  for (const d of report.duplicates) {
    const kept = byId.get(d.keep)
    for (const id of d.hide) ops.push({ op: 'hide', module_id: id, kept_id: d.keep, why: `duplicate of "${kept?.title}" (${kept?.source_company ?? 'no company'})` })
  }

  for (const id of report.multiCompany) {
    if (hidden.has(id)) continue
    const m = byId.get(id)
    ops.push({ op: 'positioning', module_id: id, why: `"${m?.title}" lists "${m?.source_company}" — becomes career-level` })
  }

  for (const job of jobs) {
    const company = normalizeCompany(job.company)
    const sameCompany = outline.filter(r => r.company && normalizeCompany(r.company) === company)
    const role = sameCompany.length === 1 ? sameCompany[0]
      : sameCompany.find(r => (r.title ?? '').trim().toLowerCase() === (job.title ?? '').trim().toLowerCase())
    if (!role || !role.date_start) continue
    const start = `${role.date_start}-01`
    const end = role.date_end ? `${role.date_end}-01` : null
    const sameStart = monthKey(job.start_date) === monthKey(start)
    const sameEnd = (isPresentDate(job.end_date) || !job.end_date) ? end === null : monthKey(job.end_date) === monthKey(end)
    if (sameStart && sameEnd) continue
    ops.push({ op: 'job_dates', job_id: job.id, start_date: start, end_date: end, why: `${jobLabel(job)}: ${fmt(job.start_date)} to ${fmt(job.end_date)} → ${fmt(start)} to ${fmt(end)} (from the resume)` })
  }
  return ops
}
