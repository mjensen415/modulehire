import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAnonClient } from '@supabase/supabase-js'

export async function GET(req: Request) {
  try {
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

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('generated_resumes')
      .select(`
        id, title, positioning_variant, created_at, expires_at, is_temp, docx_url, pdf_url,
        job_description_id,
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

      const bucket = r.is_temp ? 'temp' : 'resumes'
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

    return NextResponse.json({ resumes: withUrls })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
