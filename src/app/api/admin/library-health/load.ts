import type { SupabaseClient } from '@supabase/supabase-js'
import type { HealthJob, HealthLink, HealthModule } from '@/lib/library-health'

const PAGE = 1000

// Supabase caps a select at 1,000 rows; page through.
async function allRows<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return out
}

export type LibraryRows = {
  modules: (HealthModule & { user_id: string })[]
  jobs: (HealthJob & { user_id: string })[]
  links: HealthLink[]
}

const MODULE_FIELDS = 'id, user_id, title, content, source_company, source_role_title, date_start, date_end, type, updated_at'
const JOB_FIELDS = 'id, user_id, company, title, start_date, end_date'

/** Non-deleted modules, jobs and links — for one user, or everyone (admin overview). */
export async function loadLibraries(admin: SupabaseClient, userId?: string): Promise<LibraryRows> {
  const [modules, jobs] = await Promise.all([
    allRows<LibraryRows['modules'][number]>((from, to) => {
      let q = admin.from('modules').select(MODULE_FIELDS).is('deleted_at', null).order('id').range(from, to)
      if (userId) q = q.eq('user_id', userId)
      return q
    }),
    allRows<LibraryRows['jobs'][number]>((from, to) => {
      let q = admin.from('job_experiences').select(JOB_FIELDS).order('id').range(from, to)
      if (userId) q = q.eq('user_id', userId)
      return q
    }),
  ])
  const moduleIds = new Set(modules.map(m => m.id))
  const links = (await allRows<HealthLink>((from, to) => admin.from('module_job_assignments').select('module_id, job_id').order('module_id').range(from, to)))
    .filter(l => moduleIds.has(l.module_id))
  return { modules, jobs, links }
}
