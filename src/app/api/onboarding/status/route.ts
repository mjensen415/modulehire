import { NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = await createAdminClient()
    const [{ data: profile }, { count: moduleCount }, { count: resumeCount }] = await Promise.all([
      admin.from('users').select('onboarding_complete').eq('id', user.id).single(),
      admin.from('modules').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      admin.from('generated_resumes').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    ])

    const onboardingComplete = !!profile?.onboarding_complete
    const modules = moduleCount ?? 0
    const resumes = resumeCount ?? 0

    let step: 1 | 2 | 3 | 4 = 1
    if (resumes > 0) step = 4
    else if (modules > 0) step = 2
    else step = 1

    return NextResponse.json({
      onboarding_complete: onboardingComplete,
      module_count: modules,
      resume_count: resumes,
      step,
    })
  } catch (error) {
    console.error('[api/onboarding/status]', error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = await createAdminClient()
    const { error } = await admin
      .from('users')
      .update({ onboarding_complete: true })
      .eq('id', user.id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/onboarding/status POST]', error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
