import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { createClient as createAnonClient } from '@supabase/supabase-js'
import { uploadLimit } from '@/lib/plan'

export const maxDuration = 60

const MAX_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

async function extractText(file: File): Promise<string> {
  if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
    const { getDocumentProxy, extractText: unpdfExtract } = await import('unpdf')
    const buffer = Buffer.from(await file.arrayBuffer())
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    const { text } = await unpdfExtract(pdf, { mergePages: true })
    return text
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
    return buffer.toString('utf-8')
  }

  // DOCX
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ buffer })
  return result.value
}

export async function POST(req: Request) {
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
        if (user) supabase = authedClient as ReturnType<typeof createAnonClient>
      }
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Plan upload-limit gate (skipped for pro)
    const { data: profileRow } = await supabase
      .from('users')
      .select('plan')
      .eq('id', user.id)
      .single()
    const plan = (profileRow?.plan ?? 'free') as string
    if (plan !== 'pro') {
      const { count: existingCount } = await supabase
        .from('resumes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
      const cap = uploadLimit(plan)
      if ((existingCount ?? 0) >= cap) {
        return NextResponse.json(
          { error: 'Upload limit reached for your plan.', code: 'UPLOAD_LIMIT_REACHED', limit: cap },
          { status: 403 }
        )
      }
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    // Validate type — accept by MIME or extension (text/plain for paste flow)
    const isDocx = file.name.endsWith('.docx')
    const isPdf = file.name.endsWith('.pdf') || file.type === 'application/pdf'
    const isText = file.type === 'text/plain' || file.name.endsWith('.txt')
    if (!ALLOWED_TYPES.has(file.type) && !isDocx && !isPdf && !isText) {
      return NextResponse.json({ error: 'Only PDF and DOCX files are supported' }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File exceeds 10MB limit' }, { status: 400 })
    }

    // Extract raw text
    const rawText = await extractText(file)
    if (!rawText.trim()) {
      return NextResponse.json({ error: 'Could not extract text from file' }, { status: 400 })
    }

    // Upload original file to storage using admin client (bypasses RLS for storage)
    const adminClient = await createAdminClient()
    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${user.id}/${timestamp}-${safeName}`

    const { error: storageError } = await adminClient.storage
      .from('resumes')
      .upload(storagePath, Buffer.from(await file.arrayBuffer()), {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })

    const fileUrl = storageError ? null : storagePath

    // Insert resume row
    const { data: resumeRow, error: resumeError } = await supabase
      .from('resumes')
      .insert({
        user_id: user.id,
        filename: file.name,
        file_url: fileUrl,
        raw_text: rawText,
        parsed_at: null,
      })
      .select()
      .single()

    if (resumeError) throw resumeError

    return NextResponse.json({
      resume_id: resumeRow.id,
      raw_text: rawText,
      filename: file.name,
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
