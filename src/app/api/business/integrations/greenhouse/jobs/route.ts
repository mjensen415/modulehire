import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { listOpenJobs } from '@/lib/business/greenhouse'
import { markGreenhouseError } from '@/lib/business/integrations'
import { greenhouseContext, greenhouseFailure } from '../_shared'

// GET ?job_id= | ?org_id= — the org's open Greenhouse jobs.
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const admin = await createAdminClient()
  const ctx = await greenhouseContext(supabase, admin, user.id, { orgId: url.searchParams.get('org_id'), jobId: url.searchParams.get('job_id') })
  if (!ctx.ok) return ctx.res
  try {
    const jobs = await listOpenJobs(ctx.conn.creds)
    if (ctx.conn.status === 'error') await markGreenhouseError(admin, ctx.orgId, null)
    return NextResponse.json({ jobs: jobs.sort((a, b) => a.name.localeCompare(b.name)) })
  } catch (e) {
    return greenhouseFailure(admin, ctx.orgId, e, 'jobs')
  }
}
