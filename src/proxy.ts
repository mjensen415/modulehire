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

// Report-Only Content-Security-Policy: collects violations without blocking, so
// it's safe to ship. script-src is left permissive for now because enforcing a
// nonce-based policy in App Router requires threading a per-request nonce through
// updateSession (the Supabase auth helper) — a separate, browser-tested change.
// The other directives already constrain real exfil/clickjacking surface. To
// enforce: rename the header to 'Content-Security-Policy' and tighten script-src.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

function applySecurityHeaders(res: NextResponse) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    res.headers.set(key, value)
  }
  res.headers.set('Content-Security-Policy-Report-Only', CSP_REPORT_ONLY)
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

  // Supabase auth + cookie refresh (may itself return a redirect for protected
  // routes). Layer the security/CORS headers onto whatever response it returns —
  // the auth cookies on it are preserved untouched.
  const res = await updateSession(request)
  applySecurityHeaders(res)
  if (isApi) applyCors(res, origin)
  return res
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images, icons, etc
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
