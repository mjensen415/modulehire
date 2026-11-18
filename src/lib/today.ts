// "Today's three" on the home page: the next useful actions, computed on read from what the user
// has, in a fixed priority order. Each step has a stable key so a check can hide it for the day
// (home_step_dismissals). Nothing here calls AI.
import type { SupabaseClient } from '@supabase/supabase-js'

export type TodayStep = {
  key: string
  priority: number
  title: string
  detail?: string
  /** ISO time the client formats in the user's timezone (interview steps). */
  when?: string
  href: string
}

const DAY_MS = 86_400_000

type AppRow = {
  id: string
  company: string
  title: string
  status: string
  applied_at: string | null
  first_response_at: string | null
  job_description_id: string | null
  created_at: string
}

/**
 * All candidate steps, best first. The caller filters out the ones dismissed today and takes three.
 * `now` is injectable for tests.
 */
export async function computeTodaySteps(supabase: SupabaseClient, userId: string, profileId: string | null, now = new Date()): Promise<TodayStep[]> {
  const draftQuery = () => {
    let q = supabase.from('modules').select('id, source_document_id, source_resume_id, created_at').eq('user_id', userId).eq('status', 'draft').is('deleted_at', null)
    if (profileId) q = q.eq('profile_id', profileId)
    return q.order('created_at', { ascending: false }).limit(500)
  }
  const confirmedQuery = () => {
    let q = supabase.from('modules').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'confirmed').is('deleted_at', null)
    if (profileId) q = q.eq('profile_id', profileId)
    return q
  }
  const soon = new Date(now.getTime() + 3 * DAY_MS).toISOString()

  const [apps, resumes, drafts, confirmed, jds, interviews] = await Promise.all([
    supabase.from('job_applications').select('id, company, title, status, applied_at, first_response_at, job_description_id, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(200),
    supabase.from('generated_resumes').select('id, job_description_id, created_at').eq('user_id', userId).is('deleted_at', null).order('created_at', { ascending: false }).limit(200),
    draftQuery(),
    confirmedQuery(),
    supabase.from('job_descriptions').select('id, extracted_company, extracted_job_title', { count: 'exact' }).eq('user_id', userId).is('deleted_at', null).order('created_at', { ascending: false }).limit(200),
    // interviews arrives with the Interviews feature; until then (or on any error) it's empty.
    supabase
      .from('interviews')
      .select('id, round_name, scheduled_at, prep_opened_at, job_applications(company)')
      .eq('user_id', userId)
      .gte('scheduled_at', now.toISOString())
      .lte('scheduled_at', soon)
      .order('scheduled_at', { ascending: true }),
  ])

  const steps: TodayStep[] = []
  const appRows = (apps.data ?? []) as AppRow[]
  const resumeRows = resumes.data ?? []
  const jdRows = jds.data ?? []
  const resumeByJd = new Map<string, string>()
  for (const r of resumeRows) if (r.job_description_id && !resumeByJd.has(r.job_description_id)) resumeByJd.set(r.job_description_id, r.id)

  // 1. An interview in the next 3 days whose prep hasn't been opened.
  type InterviewRow = { id: string; round_name: string; scheduled_at: string; prep_opened_at: string | null; job_applications: { company: string } | { company: string }[] | null }
  for (const iv of ((interviews.error ? [] : interviews.data) ?? []) as InterviewRow[]) {
    if (iv.prep_opened_at) continue
    const app = Array.isArray(iv.job_applications) ? iv.job_applications[0] : iv.job_applications
    steps.push({
      key: `prep:${iv.id}`,
      priority: 1,
      title: `Prep for your ${iv.round_name.toLowerCase()} with ${app?.company ?? 'the company'}`,
      when: iv.scheduled_at,
      href: `/interviews/${iv.id}`,
    })
  }

  // 2. Draft modules waiting, grouped by the upload they came from (newest upload first).
  const draftRows = drafts.data ?? []
  if (draftRows.length > 0) {
    const newest = draftRows[0]
    const sameUpload = draftRows.filter(d =>
      newest.source_document_id ? d.source_document_id === newest.source_document_id : newest.source_resume_id ? d.source_resume_id === newest.source_resume_id : true)
    let docName = 'your upload'
    if (newest.source_document_id) {
      const { data } = await supabase.from('documents').select('filename, period_label').eq('id', newest.source_document_id).maybeSingle()
      docName = data?.filename || data?.period_label || docName
    } else if (newest.source_resume_id) {
      const { data } = await supabase.from('resumes').select('filename').eq('id', newest.source_resume_id).maybeSingle()
      docName = data?.filename || 'your resume'
    }
    const n = sameUpload.length
    steps.push({
      key: `review:${newest.source_document_id ?? newest.source_resume_id ?? 'library'}`,
      priority: 2,
      title: `Review ${n} new module${n === 1 ? '' : 's'} from ${docName}`,
      detail: draftRows.length > n ? `${draftRows.length} waiting in all` : undefined,
      href: '/library#review',
    })
  }

  // 3. Applied 5 to 9 days ago with no reply.
  for (const a of appRows) {
    if (a.status !== 'applied' || !a.applied_at || a.first_response_at) continue
    const days = Math.floor((now.getTime() - new Date(a.applied_at).getTime()) / DAY_MS)
    if (days < 5 || days > 9) continue
    steps.push({
      key: `followup:${a.id}`,
      priority: 3,
      title: `Follow up with ${a.company}`,
      detail: `You applied ${days} days ago and haven't heard back.`,
      href: `/job-tracker?followup=${a.id}`,
    })
  }

  // 4. Resume built but not applied: a tailored resume for a posting the user hasn't applied to.
  const appliedJds = new Set(appRows.filter(a => a.status !== 'saved' && a.job_description_id).map(a => a.job_description_id))
  const jdById = new Map(jdRows.map(j => [j.id, j]))
  for (const [jdId, resumeId] of resumeByJd) {
    if (appliedJds.has(jdId)) continue
    const app = appRows.find(a => a.job_description_id === jdId)
    if (app && ['rejected', 'withdrawn', 'no_response'].includes(app.status)) continue
    const jd = jdById.get(jdId)
    const title = app?.title || jd?.extracted_job_title || 'this role'
    const company = app?.company || jd?.extracted_company || 'the company'
    steps.push({ key: `apply:${jdId}`, priority: 4, title: `Apply to ${title} at ${company}`, href: `/resumes/${resumeId}` })
  }

  // 5. A tracked job with no resume (saved, not applied to yet).
  for (const a of appRows) {
    if (a.status !== 'saved') continue
    if (a.job_description_id && resumeByJd.has(a.job_description_id)) continue
    steps.push({
      key: `resume:${a.id}`,
      priority: 5,
      title: `Make your resume for ${a.company}`,
      href: a.job_description_id ? `/generate?jd_id=${a.job_description_id}` : '/generate',
    })
  }

  // 6. A thin library.
  const confirmedCount = confirmed.count ?? 0
  if (confirmedCount < 10) {
    steps.push({
      key: 'library:review-doc',
      priority: 6,
      title: 'Add a performance review to strengthen your library',
      detail: `${confirmedCount} confirmed module${confirmedCount === 1 ? '' : 's'} so far. Reviews hold the wins your resume left out.`,
      href: '/upload?kind=performance_review',
    })
  }

  // 7. No jobs yet.
  if (appRows.length === 0 && (jds.count ?? jdRows.length) === 0) {
    steps.push({ key: 'jobs:first', priority: 7, title: 'Paste your first job posting', detail: 'We build a tailored resume from your confirmed modules.', href: '/generate' })
  }

  return steps.sort((a, b) => a.priority - b.priority)
}

/** YYYY-MM-DD, validated; falls back to the server's UTC date. */
export function dayParam(v: string | null | undefined): string {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : new Date().toISOString().slice(0, 10)
}
