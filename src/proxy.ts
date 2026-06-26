import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Origins allowed to make cross-origin requests to /api/*.
const ALLOWED_ORIGINS = new Set([
  'https://modulehire.com',
  'https://www.modulehire.com',
  'http://localhost:3000',
  'http://localhost:3001',
])

const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-DNS-Prefetch-Control': 'off',
}

const CORS_METHODS = 'GET, POST, PATCH, DELETE, OPTIONS'
const CORS_HEADERS = 'Content-Type, Authorization'

// Enforced Content-Security-Policy built around a per-request nonce.
// 'strict-dynamic' + nonce covers Next's own scripts (Next reads the nonce from
// the request CSP header) and the inline theme script in the root layout. Styles
// allow 'unsafe-inline' because the app uses React inline style attributes
// throughout (style-src-attr). connect-src is locked to self + Supabase.
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ')
}

function applySecurityHeaders(res: NextResponse) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    res.headers.set(key, value)
  }
}

// Set CORS headers only when an allowed origin hits /api/*; omit otherwise.
function applyCors(res: NextResponse, origin: string | null) {
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.headers.set('Access-Control-Allow-Origin', origin)
    res.headers.set('Access-Control-Allow-Methods', CORS_METHODS)
    res.headers.set('Access-Control-Allow-Headers', CORS_HEADERS)
  }
}

export async function proxy(request: NextRequest) {
  const isApi = request.nextUrl.pathname.startsWith('/api/')
  const origin = request.headers.get('origin')

  // CORS preflight: short-circuit before any auth/cookie work, empty 200 body.
  if (isApi && request.method === 'OPTIONS') {
    const res = new NextResponse(null, { status: 200 })
    applySecurityHeaders(res)
    applyCors(res, origin)
    return res
  }

  // Per-request nonce; threaded through updateSession so Next applies it to its
  // scripts and the root layout can read it. The Supabase cookie handling on the
  // returned response is preserved untouched.
  const nonce = btoa(crypto.randomUUID())
  const csp = buildCsp(nonce)

  const res = await updateSession(request, nonce, csp)
  applySecurityHeaders(res)
  res.headers.set('Content-Security-Policy', csp)
  if (isApi) applyCors(res, origin)
  return res
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets — and skip prefetch requests
     * so a prefetch's nonce can't mismatch the real navigation's render under an
     * enforced CSP.
     */
    {
      source: '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
