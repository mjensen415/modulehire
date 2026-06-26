import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json()

    if (typeof email !== 'string' || typeof password !== 'string') {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
    }
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
    }
    if (password.length > 200) {
      return NextResponse.json({ error: 'Password is too long.' }, { status: 400 })
    }
    if (email.length > 320) {
      return NextResponse.json({ error: 'Email is too long.' }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()
    const supabase = await createAdminClient()

    const { data: { user }, error: createError } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
    })

    if (createError) {
      // Supabase signals a duplicate with code 'email_exists' (status 422) and the
      // message "A user with this email address has already been registered".
      // Match on the stable code/status — the old `includes('already registered')`
      // check broke because the message reads "already been registered".
      const isDuplicate =
        createError.code === 'email_exists' ||
        createError.status === 422 ||
        /already.*registered/i.test(createError.message)
      if (isDuplicate) {
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
