import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const now = new Date()
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`

    const [usageRes, profileRes] = await Promise.all([
      supabase
        .from('resume_generation_counts')
        .select('count, overage_credits')
        .eq('user_id', user.id)
        .eq('month', month)
        .maybeSingle(),
      supabase
        .from('users')
        .select('plan')
        .eq('id', user.id)
        .single(),
    ])

    const usage = usageRes.data as { count?: number; overage_credits?: number } | null
    const profile = profileRes.data as { plan?: string } | null

    return NextResponse.json({
      count: usage?.count ?? 0,
      overage_credits: usage?.overage_credits ?? 0,
      plan: profile?.plan ?? 'free',
    })
  } catch (error) {
    console.error('[api/usage]', error)
    return NextResponse.json({ error: 'Could not load usage.' }, { status: 500 })
  }
}
