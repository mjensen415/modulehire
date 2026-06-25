import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAnonClient } from '@supabase/supabase-js'
import { computeStorageUsage } from '@/lib/plan'

// Resolve the user from the session cookie, falling back to a Bearer token.
async function resolveAuth(req: Request) {
  let supabase = await createClient()
  let { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const authHeader = req.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      const authedClient = createAnonClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
      )
      const { data } = await authedClient.auth.getUser()
      user = data.user
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (user) supabase = authedClient as any
    }
  }
  return { user, supabase }
}

export async function GET(req: Request) {
  try {
    const { user, supabase } = await resolveAuth(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('generated_resumes')
      .select(`
        id, title, positioning_variant, created_at, expires_at, is_temp, docx_url, pdf_url,
        job_description_id, ats_score,
        job_descriptions (extracted_company, extracted_role_type)
      `)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error

    // Generate signed URLs for each resume
    const withUrls = await Promise.all((data ?? []).map(async (r) => {
      const isExpired = r.expires_at && new Date(r.expires_at) < new Date()
      if (isExpired) return { ...r, docx_signed: null, pdf_signed: null, expired: true }

      const bucket = 'temp' // TODO: update to 'resumes' once storage bucket is renamed
      const [docxSigned, pdfSigned] = await Promise.all([
        r.docx_url ? supabase.storage.from(bucket).createSignedUrl(r.docx_url, 3600) : Promise.resolve({ data: null }),
        r.pdf_url ? supabase.storage.from(bucket).createSignedUrl(r.pdf_url, 3600) : Promise.resolve({ data: null }),
      ])
      return {
        ...r,
        docx_signed: docxSigned.data?.signedUrl ?? null,
        pdf_signed: pdfSigned.data?.signedUrl ?? null,
        expired: false,
      }
    }))

    // Storage usage for the non-blocking limit banner. Count all non-deleted
    // resumes (not just the 50 returned above), and sum the actual file sizes in
    // the user's storage folder (docx + pdf + cover artifacts).
    const [{ count: resumeCount }, { data: files }] = await Promise.all([
      supabase
        .from('generated_resumes')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('deleted_at', null),
      supabase.storage.from('temp').list(user.id, { limit: 1000 }),
    ])
    const bytes = (files ?? []).reduce((sum, f) => sum + (f.metadata?.size ?? 0), 0)
    const storage = computeStorageUsage(resumeCount ?? 0, bytes)

    return NextResponse.json({ resumes: withUrls, storage })
  } catch (error) {
    console.error('[my-resumes/route.ts]', error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}

// Soft-delete a single resume (deleted_at = now()). Scoped to the caller's own
// rows; storage files are left for the nightly purge to reclaim.
export async function PATCH(req: Request) {
  try {
    const { user, supabase } = await resolveAuth(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await req.json()
    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'Missing resume id' }, { status: 400 })
    }

    const { error } = await supabase
      .from('generated_resumes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[my-resumes/route.ts PATCH]', error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
