import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requiredString } from '@/lib/validate'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const name = requiredString(body.name, 100, 'name')

    const baseSlug = slugify(name) || 'org'
    let slug = baseSlug
    let suffix = 2
    while (true) {
      const { data: existing } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', slug)
        .maybeSingle()
      if (!existing) break
      slug = `${baseSlug}-${suffix}`
      suffix += 1
    }

    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({ name, slug, owner_id: user.id })
      .select('id, name, slug, tier, created_at')
      .single()
    if (orgError) throw orgError

    const { error: memberError } = await supabase
      .from('org_members')
      .insert({ org_id: org.id, user_id: user.id, role: 'owner' })
    if (memberError) throw memberError

    return NextResponse.json({ org })
  } catch (error) {
    if (error instanceof Error && error.name === 'ValidationError') {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('[business/organizations POST]', error)
    return NextResponse.json({ error: 'Could not create organization.' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: memberships, error: memberError } = await supabase
      .from('org_members')
      .select('role, organizations ( id, name, slug, tier, created_at )')
      .eq('user_id', user.id)
    if (memberError) throw memberError

    type OrgRow = { id: string; name: string; slug: string; tier: string; created_at: string }
    const orgs = (memberships ?? [])
      .filter((m): m is typeof m & { organizations: OrgRow } => !!m.organizations)
      .map((m) => ({
        id: m.organizations.id,
        name: m.organizations.name,
        slug: m.organizations.slug,
        tier: m.organizations.tier,
        role: m.role,
        created_at: m.organizations.created_at,
      }))

    return NextResponse.json({ orgs })
  } catch (error) {
    console.error('[business/organizations GET]', error)
    return NextResponse.json({ error: 'Could not load organizations.' }, { status: 500 })
  }
}
