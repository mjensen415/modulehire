import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = await createAdminClient()

    // Fetch all non-deleted modules that have a source_company
    const { data: modules, error: modsError } = await admin
      .from('modules')
      .select('id, source_company, source_role_title, date_start, date_end, employment_type')
      .eq('user_id', user.id)
      .not('source_company', 'is', null)
      .is('deleted_at', null)
    if (modsError) throw modsError

    const DATE_RE = /^\d{4}-\d{2}$/
    function parseDate(raw: string): string | null {
      const v = raw.trim()
      if (DATE_RE.test(v)) return `${v}-01`
      return null
    }

    // Collect unique (company, title, start_date) combos
    const seen = new Set<string>()
    const uniqueExperiences: {
      user_id: string
      company: string
      title: string | null
      start_date: string | null
      end_date: string | null
      employment_type: string
    }[] = []

    for (const m of (modules ?? [])) {
      const company   = String(m.source_company    ?? '').trim()
      const roleTitle = String(m.source_role_title ?? '').trim()
      const startRaw  = String(m.date_start        ?? '').trim()
      const endRaw    = String(m.date_end           ?? '').trim()
      if (!company) continue
      const key = `${company}||${roleTitle}||${startRaw}`
      if (seen.has(key)) continue
      seen.add(key)
      uniqueExperiences.push({
        user_id:          user.id,
        company,
        title:            roleTitle || null,
        start_date:       parseDate(startRaw),
        end_date:         endRaw.toLowerCase() === 'present' ? null : parseDate(endRaw),
        employment_type:  String(m.employment_type ?? 'full-time'),
      })
    }

    let jobsCreated = uniqueExperiences.length
    let assignmentsCreated = 0

    if (uniqueExperiences.length > 0) {
      const { error: jeError } = await admin
        .from('job_experiences')
        .upsert(uniqueExperiences, { onConflict: 'user_id,company,title,start_date', ignoreDuplicates: true })
      if (jeError) throw jeError

      // Fetch back all job_experiences for these companies so we have their IDs
      const companies = [...new Set(uniqueExperiences.map(e => e.company))]
      const { data: jobExperiences, error: fetchError } = await admin
        .from('job_experiences')
        .select('id, company, title, start_date')
        .eq('user_id', user.id)
        .in('company', companies)
      if (fetchError) throw fetchError

      jobsCreated = (jobExperiences ?? []).length

      // Build lookup: "company||title||start_date" → job id
      const jobLookup = new Map<string, string>()
      for (const je of (jobExperiences ?? [])) {
        jobLookup.set(`${je.company}||${je.title ?? ''}||${je.start_date ?? ''}`, je.id)
      }

      // Map each module to its job and collect assignments
      const assignments: { module_id: string; job_id: string }[] = []
      for (const mod of (modules ?? [])) {
        const company   = String(mod.source_company    ?? '').trim()
        const roleTitle = String(mod.source_role_title ?? '').trim()
        const startRaw  = String(mod.date_start        ?? '').trim()
        const startDate = parseDate(startRaw) ?? ''
        const jobId = jobLookup.get(`${company}||${roleTitle}||${startDate}`)
        if (jobId) assignments.push({ module_id: mod.id, job_id: jobId })
      }

      if (assignments.length > 0) {
        const { error: assignError } = await admin
          .from('module_job_assignments')
          .upsert(assignments, { onConflict: 'module_id,job_id', ignoreDuplicates: true })
        if (assignError) throw assignError
        assignmentsCreated = assignments.length
      }
    }

    return NextResponse.json({ jobs_created: jobsCreated, assignments_created: assignmentsCreated })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
