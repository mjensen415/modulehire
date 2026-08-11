import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest, nonce?: string, csp?: string) {
  // Build the pass-through response from the (optionally nonce-augmented) request
  // headers. Setting the CSP on the request header lets Next.js apply the nonce to
  // its own scripts; x-nonce is read by the root layout for its inline script.
  const makeResponse = () => {
    const headers = new Headers(request.headers)
    if (nonce) headers.set('x-nonce', nonce)
    if (csp) headers.set('Content-Security-Policy', csp)
    // Thread pathname so server-component layouts can branch without restructuring.
    headers.set('x-pathname', request.nextUrl.pathname)
    return NextResponse.next({ request: { headers } })
  }

  let supabaseResponse = makeResponse()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy',
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          const cookieDomain = request.headers.get('host')?.endsWith('modulehire.com')
            ? '.modulehire.com'
            : undefined
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = makeResponse()
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...options,
              ...(cookieDomain ? { domain: cookieDomain } : {}),
            })
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // The (app) route group has no URL prefix, so guard the real paths it serves.
  const PROTECTED_PREFIXES = [
    '/dashboard',
    '/library',
    '/generate',
    '/account',
    '/billing',
    '/applications',
    '/matches',
    '/resumes',
    '/my-info',
    '/upload',
    '/module-review',
    '/module-selection',
    '/preview',
    '/admin',
    '/onboarding',
    '/business',
  ]

  const { pathname } = request.nextUrl
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )

  if (!user && isProtected) {
    // /business (exact) is the public landing page — let unauthenticated visitors through.
    // All /business/* subpaths require auth and are caught by the prefix check above.
    if (pathname === '/business') return supabaseResponse
    const url = request.nextUrl.clone()
    url.pathname = '/signin'
    // Preserve business context so signin redirects back to the business app,
    // not the personal dashboard.
    if (pathname.startsWith('/business/')) {
      url.searchParams.set('next', '/business/dashboard')
    }
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
