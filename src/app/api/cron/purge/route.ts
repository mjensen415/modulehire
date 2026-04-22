import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: expired, error } = await supabase.rpc('purge_expired_temp_files')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const paths: string[] = []
  for (const row of expired ?? []) {
    if (row.docx_path) paths.push(row.docx_path)
    if (row.pdf_path) paths.push(row.pdf_path)
  }

  if (paths.length > 0) {
    await supabase.storage.from('temp').remove(paths)
  }

  return NextResponse.json({ purged: paths.length })
}
