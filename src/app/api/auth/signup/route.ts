import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const { code, email, password } = await req.json()

    if (typeof code !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
      return NextResponse.json({ error: 'Code, email, and password are required.' }, { status: 400 })
    }
    if (!code || !email || !password) {
      return NextResponse.json({ error: 'Code, email, and password are required.' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })
    }
    if (password.length > 200) {
      return NextResponse.json({ error: 'Password is too long.' }, { status: 400 })
    }
    if (email.length > 320) {
      return NextResponse.json({ error: 'Email is too long.' }, { status: 400 })
    }

    const normalizedCode = code.toUpperCase().trim()
    const normalizedEmail = email.toLowerCase().trim()
    const supabase = await createAdminClient()

    // Atomic claim: only one request can flip used_at from null to now()
    const claimedAt = new Date().toISOString()
    const { data: claimed, error: claimError } = await supabase
      .from('beta_codes')
      .update({ used_by_email: normalizedEmail, used_at: claimedAt })
      .eq('code', normalizedCode)
      .eq('is_active', true)
      .is('used_at', null)
      .select('code')
      .single()

    if (claimError || !claimed) {
      return NextResponse.json({ error: 'Invalid or already-used beta code.' }, { status: 400 })
    }

    // Create the user
    const { data: { user }, error: createError } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
    })

    if (createError) {
      // Roll the claim back so the code stays usable
      await supabase
        .from('beta_codes')
        .update({ used_at: null, used_by_email: null })
        .eq('code', normalizedCode)
        .eq('used_at', claimedAt)

      if (createError.message.includes('already registered')) {
        return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 400 })
      }
      console.error('[signup] createUser failed:', createError)
      return NextResponse.json({ error: 'Could not create account.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, userId: user?.id })
  } catch (error) {
    console.error('[signup]', error)
    return NextResponse.json({ error: 'Could not create account.' }, { status: 500 })
  }
}
