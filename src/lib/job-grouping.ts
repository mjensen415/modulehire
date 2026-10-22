// Which job a module belongs to, and which modules a fresh draft should use. Shared by
// generate-resume (experience entries) and /api/jobs/start (auto-pick), so "which role is this
// module from" has one answer everywhere.
import { compareResumeRanges, normalizeCompany } from './resume-dates'

export type JobRow = { id: string; company: string; title: string | null; start_date: string | null; end_date: string | null }
export type ModuleForJob = { id: string; type?: unknown; source_company?: unknown; source_role_title?: unknown }

export const byRecency = (a: JobRow, b: JobRow) => compareResumeRanges(a.start_date, a.end_date, b.start_date, b.end_date)

/**
 * Builds a module → job resolver. A module's job is its assignment (module_job_assignments;
 * the most recent if several); unassigned modules join a job only on a normalized company
 * match (title breaks ties, then recency). Positioning modules are career-level: no job.
 */
export function jobResolver(jobs: JobRow[], assignments: { module_id: string; job_id: string }[]) {
  const jobById = new Map(jobs.map(j => [j.id, j]))
  const assigned = new Map<string, JobRow>()
  for (const row of assignments) {
    const job = jobById.get(row.job_id)
    if (!job) continue
    const prev = assigned.get(row.module_id)
    if (!prev || byRecency(job, prev) < 0) assigned.set(row.module_id, job)
  }
  return (m: ModuleForJob): JobRow | null => {
    if (m.type === 'positioning') return null
    const hit = assigned.get(String(m.id))
    if (hit) return hit
    const company = normalizeCompany(m.source_company)
    if (!company) return null
    const candidates = jobs.filter(j => normalizeCompany(j.company) === company)
    if (candidates.length <= 1) return candidates[0] ?? null
    const role = String(m.source_role_title ?? '').trim().toLowerCase()
    return candidates.find(j => (j.title ?? '').trim().toLowerCase() === role) ?? [...candidates].sort(byRecency)[0]
  }
}

export type RankedForPick = { module_id: string; match_score: number; pinned?: boolean; type?: unknown; source_company?: unknown; source_role_title?: unknown }

/** Per-role caps for an auto-picked draft: the two most recent roles get the most room. */
export const AUTO_PICK = {
  recentRoles: 2,
  modulesRecent: 3,
  modulesOlder: 2,
  bulletsRecent: 4,
  bulletsOlder: 2,
  careerModules: 2,
  minScoreToBackfill: 60,
  maxModules: 12,
}

/**
 * Picks a draft's modules without asking the user: the matcher's recommended stack first
 * (pinned, then highest pass-2 scores), capped per role — 3 modules for the two most recent
 * roles, 2 for older ones — then the best remaining module (score ≥ 60) for any recent role the
 * stack left empty. Career-level modules (no job) only come in via the stack, at most 2.
 */
export function autoPickModules(
  ranked: RankedForPick[],
  recommendedStack: string[],
  jobs: JobRow[],
  resolveJob: (m: ModuleForJob) => JobRow | null,
): string[] {
  const byId = new Map(ranked.map(m => [m.module_id, m]))
  const jobOrder = [...jobs].sort(byRecency).map(j => j.id)
  const capFor = (jobId: string) => (jobOrder.indexOf(jobId) < AUTO_PICK.recentRoles ? AUTO_PICK.modulesRecent : AUTO_PICK.modulesOlder)
  const perJob = new Map<string, number>()
  let career = 0
  const picked: string[] = []

  const tryAdd = (id: string, fromStack: boolean) => {
    const m = byId.get(id)
    if (!m || picked.includes(id) || picked.length >= AUTO_PICK.maxModules) return
    const job = resolveJob({ id, type: m.type, source_company: m.source_company, source_role_title: m.source_role_title })
    if (!job) {
      if (!fromStack || career >= AUTO_PICK.careerModules) return
      career++
      picked.push(id)
      return
    }
    const count = perJob.get(job.id) ?? 0
    if (count >= capFor(job.id)) return
    if (!fromStack && count > 0) return
    perJob.set(job.id, count + 1)
    picked.push(id)
  }

  const stack = [...recommendedStack].sort((a, b) => {
    const ma = byId.get(a), mb = byId.get(b)
    return Number(!!mb?.pinned) - Number(!!ma?.pinned) || (mb?.match_score ?? 0) - (ma?.match_score ?? 0)
  })
  for (const id of stack) tryAdd(id, true)

  // A recent role with nothing picked still gets its best module, if it's a real fit.
  const rest = [...ranked].filter(m => m.match_score >= AUTO_PICK.minScoreToBackfill).sort((a, b) => b.match_score - a.match_score)
  for (const jobId of jobOrder.slice(0, AUTO_PICK.recentRoles)) {
    if ((perJob.get(jobId) ?? 0) > 0) continue
    const best = rest.find(m => resolveJob({ id: m.module_id, type: m.type, source_company: m.source_company, source_role_title: m.source_role_title })?.id === jobId)
    if (best) tryAdd(best.module_id, false)
  }
  return picked
}
