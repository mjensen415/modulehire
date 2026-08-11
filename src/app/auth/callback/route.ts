import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
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

      // Check if this OAuth flow originated from the business subdomain.
      // The signin page sets __mh_oauth_src=business before triggering OAuth.
      const cookieStore = await cookies()
      const isBusinessOAuth = cookieStore.get('__mh_oauth_src')?.value === 'business'

      if (isBusinessOAuth) {
        // Redirect to the business subdomain root — its page.tsx handles
        // dashboard-vs-onboarding routing based on org membership.
        const res = NextResponse.redirect('https://business.modulehire.com/')
        res.cookies.set('__mh_oauth_src', '', { domain: '.modulehire.com', path: '/', maxAge: 0 })
        return res
      }

      // Route new accounts to /onboarding and returning users to /dashboard.
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
