import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { markIntegrationError } from '@/lib/business/integrations'
import { atsContext, providerFailure, providerParam, type ProviderRouteContext } from '../../_shared'

// GET ?job_id= | ?org_id= — the ATS's open jobs: [{ id, name, requisition_id }].
export async function GET(req: Request, { params }: ProviderRouteContext) {
  const provider = providerParam((await params).provider)
  if (!provider) return NextResponse.json({ error: 'Unknown integration' }, { status: 404 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const admin = await createAdminClient()
  const ctx = await atsContext(supabase, admin, user.id, provider, { orgId: url.searchParams.get('org_id'), jobId: url.searchParams.get('job_id') })
  if (!ctx.ok) return ctx.res
  try {
    const jobs = await ctx.adapter.listJobs(ctx.c)
    if (ctx.conn.status === 'error') await markIntegrationError(admin, ctx.orgId, provider, null)
    return NextResponse.json({ jobs: jobs.sort((a, b) => a.name.localeCompare(b.name)) })
  } catch (e) {
    return providerFailure(admin, ctx.orgId, provider, e, 'jobs')
  }
}
