import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const { code, email, password } = await req.json()

    if (!code || !email || !password) {
      return NextResponse.json({ error: 'Code, email, and password are required.' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })
    }

    const normalizedCode = code.toUpperCase().trim()
    const supabase = await createAdminClient()

    // Re-validate code server-side (can't trust client)
    const { data: codeRow } = await supabase
      .from('beta_codes')
      .select('code, is_active, used_at')
      .eq('code', normalizedCode)
      .single()

    if (!codeRow || !codeRow.is_active || codeRow.used_at) {
      return NextResponse.json({ error: 'Invalid or already-used beta code.' }, { status: 400 })
    }

    // Create the user (email confirmed immediately — no email verification step)
    const { data: { user }, error: createError } = await supabase.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password,
      email_confirm: true,
    })

    if (createError) {
      // Surface readable errors
      if (createError.message.includes('already registered')) {
        return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 400 })
      }
      throw createError
    }

    // Mark code as used
    await supabase
      .from('beta_codes')
      .update({ used_by_email: email.toLowerCase().trim(), used_at: new Date().toISOString() })
      .eq('code', normalizedCode)

    return NextResponse.json({ success: true, userId: user?.id })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
