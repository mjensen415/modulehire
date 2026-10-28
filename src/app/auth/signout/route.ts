import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    await supabase.auth.signOut()
  }

  // ?next= lets "Use a different account" on /oauth/consent sign out and land back on sign-in.
  // Relative paths only, so this can't become an open redirect.
  const next = new URL(request.url).searchParams.get('next')
  const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : '/'

  return NextResponse.redirect(new URL(dest, request.url), {
    status: 302,
  })
}
