import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { jobPostText } from '@/lib/business/greenhouse'
import { greenhouseContext, greenhouseFailure } from '../../_shared'

// GET ?org_id=&gh_job_id= — a Greenhouse job's posting as plain text, to start a ModuleHire
// posting from it (the new-posting page fills its title and description).
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const ghJobId = Number(url.searchParams.get('gh_job_id'))
  if (!Number.isSafeInteger(ghJobId) || ghJobId <= 0) return NextResponse.json({ error: 'Invalid gh_job_id' }, { status: 400 })
  const admin = await createAdminClient()
  const ctx = await greenhouseContext(supabase, admin, user.id, { orgId: url.searchParams.get('org_id') })
  if (!ctx.ok) return ctx.res
  try {
    const post = await jobPostText(ctx.conn.creds, ghJobId)
    if (!post) return NextResponse.json({ error: 'This Greenhouse job has no posting text yet. Paste the description instead.' }, { status: 404 })
    return NextResponse.json({ title: post.title, text: post.text.slice(0, 50_000) })
  } catch (e) {
    return greenhouseFailure(admin, ctx.orgId, e, 'job-post')
  }
}
