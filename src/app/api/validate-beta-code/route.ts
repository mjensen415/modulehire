import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')?.toUpperCase().trim()

  if (!code || code.length < 4) {
    return NextResponse.json({ valid: false, message: '' })
  }

  try {
    const supabase = await createAdminClient()
    const { data } = await supabase
      .from('beta_codes')
      .select('code, is_active, used_at')
      .eq('code', code)
      .single()

    if (!data) {
      return NextResponse.json({ valid: false, message: 'Code not found.' })
    }
    if (!data.is_active) {
      return NextResponse.json({ valid: false, message: 'This code has been deactivated.' })
    }
    if (data.used_at) {
      return NextResponse.json({ valid: false, message: 'This code has already been used.' })
    }

    return NextResponse.json({ valid: true, message: 'Code accepted!' })
  } catch (error) {
    console.error('[validate-beta-code]', error)
    return NextResponse.json({ valid: false, message: 'Could not validate code.' }, { status: 500 })
  }
}
