import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Only allow relative paths starting with a single "/" — blocks open redirects.
function safeNext(raw: string | null): string | null {
  if (!raw) return null
  if (!raw.startsWith('/') || raw.startsWith('//')) return null
  return raw
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const explicitNext = safeNext(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // If the caller specified ?next=, honour it.
      if (explicitNext) return NextResponse.redirect(`${origin}${explicitNext}`)

      // Otherwise, route new accounts to /onboarding and returning users to /dashboard.
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('users')
          .select('onboarding_complete')
          .eq('id', user.id)
          .single()
        const dest = profile?.onboarding_complete ? '/dashboard' : '/onboarding'
        return NextResponse.redirect(`${origin}${dest}`)
      }
      return NextResponse.redirect(`${origin}/dashboard`)
    }
  }

  return NextResponse.redirect(`${origin}/signin?error=auth`)
}
