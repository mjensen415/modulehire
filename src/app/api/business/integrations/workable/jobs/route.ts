import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { listOpenWorkableJobs } from '@/lib/business/workable'
import { markIntegrationError } from '@/lib/business/integrations'
import { providerFailure, workableContext } from '../../_shared'

// GET ?job_id= | ?org_id= — published and internal Workable jobs ({ id: shortcode, name }).
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const admin = await createAdminClient()
  const ctx = await workableContext(supabase, admin, user.id, { orgId: url.searchParams.get('org_id'), jobId: url.searchParams.get('job_id') })
  if (!ctx.ok) return ctx.res
  try {
    const jobs = await listOpenWorkableJobs(ctx.conn.creds)
    if (ctx.conn.status === 'error') await markIntegrationError(admin, ctx.orgId, 'workable', null)
    return NextResponse.json({ jobs: jobs.sort((a, b) => a.name.localeCompare(b.name)) })
  } catch (e) {
    return providerFailure(admin, ctx.orgId, 'workable', e, 'jobs')
  }
}
