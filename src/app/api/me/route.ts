import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_PATCH_FIELDS: Record<string, number> = {
  name: 200,
  phone: 30,
  linkedin_url: 500,
  location: 200,
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('users')
      .select('name, email, phone, linkedin_url, location, plan')
      .eq('id', user.id)
      .single()

    if (error) throw error

    return NextResponse.json({
      name: data.name ?? (user.user_metadata?.full_name as string) ?? '',
      email: data.email ?? user.email ?? '',
      phone: data.phone ?? '',
      linkedin_url: data.linkedin_url ?? '',
      location: data.location ?? '',
      plan: data.plan ?? 'free',
    })
  } catch (error) {
    console.error('[api/me]', error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const update: Record<string, string> = {}
    for (const [key, val] of Object.entries(body)) {
      const max = ALLOWED_PATCH_FIELDS[key]
      if (max && typeof val === 'string') {
        if (val.length > max) {
          return NextResponse.json({ error: `${key} is too long (max ${max})` }, { status: 400 })
        }
        update[key] = val
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('users')
      .update(update)
      .eq('id', user.id)
      .select('name, email, phone, linkedin_url, location, plan')
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('[api/me]', error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
