import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { PROVIDER_INFO } from '@/lib/business/ats/registry'
import { atsContext, providerFailure, providerParam, type ProviderRouteContext } from '../../_shared'

// GET ?org_id=&ats_job_id= — an ATS job's description as plain text, to start a posting from it.
export async function GET(req: Request, { params }: ProviderRouteContext) {
  const provider = providerParam((await params).provider)
  if (!provider) return NextResponse.json({ error: 'Unknown integration' }, { status: 404 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const atsJobId = url.searchParams.get('ats_job_id') ?? ''
  const admin = await createAdminClient()
  const ctx = await atsContext(supabase, admin, user.id, provider, { orgId: url.searchParams.get('org_id') })
  if (!ctx.ok) return ctx.res
  if (!ctx.adapter.validJobId(atsJobId)) return NextResponse.json({ error: 'Invalid ats_job_id' }, { status: 400 })
  try {
    const post = await ctx.adapter.jobText(ctx.c, atsJobId)
    if (!post) return NextResponse.json({ error: `${PROVIDER_INFO[provider].label} didn't return a description for this job. Paste it instead.` }, { status: 404 })
    return NextResponse.json({ title: post.title, text: post.text.slice(0, 50_000) })
  } catch (e) {
    return providerFailure(admin, ctx.orgId, provider, e, 'job-post')
  }
}
