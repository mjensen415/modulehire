import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isShortcode, workableJobText } from '@/lib/business/workable'
import { providerFailure, workableContext } from '../../_shared'

// GET ?org_id=&shortcode= — a Workable job's description as plain text, to start a posting from it.
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const shortcode = url.searchParams.get('shortcode')
  if (!isShortcode(shortcode)) return NextResponse.json({ error: 'Invalid shortcode' }, { status: 400 })
  const admin = await createAdminClient()
  const ctx = await workableContext(supabase, admin, user.id, { orgId: url.searchParams.get('org_id') })
  if (!ctx.ok) return ctx.res
  try {
    const post = await workableJobText(ctx.conn.creds, shortcode)
    if (!post) return NextResponse.json({ error: 'This Workable job has no description yet. Paste it instead.' }, { status: 404 })
    return NextResponse.json({ title: post.title, text: post.text.slice(0, 50_000) })
  } catch (e) {
    return providerFailure(admin, ctx.orgId, 'workable', e, 'job-post')
  }
}
