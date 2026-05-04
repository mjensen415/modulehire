import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type EducationEntry = {
  school: string
  degree: string
  field: string
  year: string
}

const FIELD_MAX = 200

function sanitizeEntry(raw: unknown): EducationEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const school = typeof r.school === 'string' ? r.school.trim().slice(0, FIELD_MAX) : ''
  const degree = typeof r.degree === 'string' ? r.degree.trim().slice(0, FIELD_MAX) : ''
  const field  = typeof r.field  === 'string' ? r.field.trim().slice(0, FIELD_MAX)  : ''
  const year   = typeof r.year   === 'string' ? r.year.trim().slice(0, 50)          : ''
  // Drop entirely-empty rows so the user can clear an entry by blanking it.
  if (!school && !degree && !field && !year) return null
  return { school, degree, field, year }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('education')
      .select('id, school, degree, field, year, sort_order')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) throw error
    return NextResponse.json({ education: data ?? [] })
  } catch (e) {
    console.error('[api/education GET]', e)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}

// PUT replaces the user's education list with the provided array.
// Body: { education: EducationEntry[] }
export async function PUT(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    if (!body || !Array.isArray(body.education)) {
      return NextResponse.json({ error: 'Body must be { education: [] }' }, { status: 400 })
    }
    if (body.education.length > 20) {
      return NextResponse.json({ error: 'Too many education entries (max 20)' }, { status: 400 })
    }

    const cleaned = (body.education as unknown[])
      .map(sanitizeEntry)
      .filter((e): e is EducationEntry => e !== null)

    const { error: delErr } = await supabase.from('education').delete().eq('user_id', user.id)
    if (delErr) throw delErr

    if (cleaned.length === 0) {
      return NextResponse.json({ education: [] })
    }

    const rows = cleaned.map((e, i) => ({ user_id: user.id, ...e, sort_order: i }))
    const { data, error } = await supabase
      .from('education')
      .insert(rows)
      .select('id, school, degree, field, year, sort_order')
      .order('sort_order', { ascending: true })

    if (error) throw error
    return NextResponse.json({ education: data ?? [] })
  } catch (e) {
    console.error('[api/education PUT]', e)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
