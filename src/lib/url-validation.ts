import { lookup } from 'dns/promises'
import { lookup as dnsLookupCb, type LookupAddress } from 'dns'
import { isIP } from 'net'
import http from 'http'
import https from 'https'

const BLOCKED_HOSTS = new Set(['localhost', '0.0.0.0', 'metadata.google.internal', 'metadata'])

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, o) => (acc << 8) + (parseInt(o, 10) & 255), 0) >>> 0
}

function inV4(ip: string, cidr: string): boolean {
  const [base, bitsStr] = cidr.split('/')
  const bits = parseInt(bitsStr, 10)
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask)
}

const PRIVATE_V4 = [
  '0.0.0.0/8', // "this network"
  '10.0.0.0/8',
  '100.64.0.0/10', // carrier-grade NAT
  '127.0.0.0/8',
  '169.254.0.0/16', // link-local, cloud metadata 169.254.169.254
  '172.16.0.0/12',
  '192.0.0.0/24',
  '192.0.2.0/24',
  '192.168.0.0/16',
  '198.18.0.0/15',
  '198.51.100.0/24',
  '203.0.113.0/24',
  '224.0.0.0/4', // multicast
  '240.0.0.0/4', // reserved, broadcast
]

/** True for any address a server-side fetch must never reach. Unparseable input counts as private. */
export function isPrivateIp(raw: string): boolean {
  const ip = raw.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0]
  const v = isIP(ip)
  if (v === 4) return PRIVATE_V4.some((c) => inV4(ip, c))
  if (v === 6) {
    // IPv4-mapped / translated (::ffff:a.b.c.d, ::ffff:7f00:1, 64:ff9b::a.b.c.d)
    const dotted = ip.match(/(?:^::ffff:|^64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/)
    if (dotted) return isPrivateIp(dotted[1])
    const hexMapped = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
    if (hexMapped) {
      const hi = parseInt(hexMapped[1], 16)
      const lo = parseInt(hexMapped[2], 16)
      return isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`)
    }
    if (ip === '::' || ip === '::1') return true
    const first = parseInt(ip.split(':')[0] || '0', 16)
    if ((first & 0xfe00) === 0xfc00) return true // fc00::/7 unique-local
    if ((first & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
    if ((first & 0xff00) === 0xff00) return true // ff00::/8 multicast
    if (ip.startsWith('2001:db8')) return true // documentation
    return false
  }
  return true
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string }

/**
 * First-pass check that a URL is safe to fetch from the server: http(s) only, no blocked
 * hostnames, and every address the name currently resolves to is public. On its own this
 * is not enough (DNS can change between this check and the fetch); fetch with
 * safeFetchText(), which re-validates the address it actually connects to.
 */
export async function validateExternalUrl(raw: unknown): Promise<UrlCheck> {
  if (typeof raw !== 'string' || !raw) return { ok: false, reason: 'Invalid URL' }

  let parsed: URL
  try { parsed = new URL(raw) } catch { return { ok: false, reason: 'Invalid URL' } }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'Only http(s) URLs are allowed' }
  }
  if (parsed.username || parsed.password) return { ok: false, reason: 'URLs with credentials are not allowed' }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (BLOCKED_HOSTS.has(host) || host.endsWith('.localhost') || host.endsWith('.internal')) {
    return { ok: false, reason: 'Host not allowed' }
  }

  if (isIP(host)) {
    if (isPrivateIp(host)) return { ok: false, reason: 'Private IP not allowed' }
  } else {
    try {
      const addrs = await lookup(host, { all: true, verbatim: true })
      if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) {
        return { ok: false, reason: 'Host resolves to a private IP' }
      }
    } catch {
      return { ok: false, reason: 'Could not resolve host' }
    }
  }

  return { ok: true, url: parsed }
}

/**
 * DNS lookup for http(s).request that refuses private addresses. Because the socket
 * connects to exactly the address this returns, the check and the connection can't
 * disagree (closes the DNS-rebinding window, ACTION-PLAN P4.2).
 */
function guardedLookup(
  hostname: string,
  options: { all?: boolean; family?: number } | number,
  callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
) {
  const opts = typeof options === 'number' ? { family: options } : options ?? {}
  dnsLookupCb(hostname, { ...opts, all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err, '')
    const list = addresses as LookupAddress[]
    if (!list.length || list.some((a) => isPrivateIp(a.address))) {
      const e = new Error(`Refusing to connect: ${hostname} resolves to a private address`) as NodeJS.ErrnoException
      e.code = 'EPRIVATEADDR'
      return callback(e, '')
    }
    if (opts.all) return callback(null, list)
    callback(null, list[0].address, list[0].family)
  })
}

export type SafeFetchResult =
  | { ok: true; status: number; contentType: string; body: string; finalUrl: URL }
  | { ok: false; reason: 'blocked' | 'too_large' | 'too_many_redirects' | 'http_error' | 'network'; status?: number; detail?: string }

/**
 * GET a public URL as text with SSRF protection: connect-time address checks (also for
 * literal IPs), at most `maxRedirects` redirects with each hop re-validated, a streaming
 * byte cap, and a total timeout.
 */
export async function safeFetchText(
  start: URL,
  opts: { maxBytes: number; timeoutMs: number; maxRedirects?: number; headers?: Record<string, string> },
): Promise<SafeFetchResult> {
  const res = await safeFetchBuffer(start, opts)
  return res.ok ? { ...res, body: res.body.toString('utf8') } : res
}

export type SafeFetchBufferResult =
  | { ok: true; status: number; contentType: string; body: Buffer; finalUrl: URL }
  | Extract<SafeFetchResult, { ok: false }>

/** safeFetchText's binary twin (files such as resumes from a signed ATS link). */
export async function safeFetchBuffer(
  start: URL,
  opts: { maxBytes: number; timeoutMs: number; maxRedirects?: number; headers?: Record<string, string> },
): Promise<SafeFetchBufferResult> {
  const deadline = Date.now() + opts.timeoutMs
  let url = start
  for (let hop = 0; hop <= (opts.maxRedirects ?? 3); hop++) {
    const check = await validateExternalUrl(url.toString())
    if (!check.ok) return { ok: false, reason: 'blocked', detail: check.reason }

    const res = await requestOnce(url, opts.headers ?? {}, opts.maxBytes, Math.max(1, deadline - Date.now()))
    if (!res.ok) return res
    if (res.status >= 300 && res.status < 400) {
      if (!res.location) return { ok: false, reason: 'http_error', status: res.status }
      try { url = new URL(res.location, url) } catch { return { ok: false, reason: 'http_error', status: res.status } }
      continue
    }
    if (res.status < 200 || res.status >= 300) return { ok: false, reason: 'http_error', status: res.status }
    return { ok: true, status: res.status, contentType: res.contentType, body: res.body, finalUrl: url }
  }
  return { ok: false, reason: 'too_many_redirects' }
}

type OnceResult =
  | { ok: true; status: number; contentType: string; location?: string; body: Buffer }
  | { ok: false; reason: 'blocked' | 'too_large' | 'network'; detail?: string }

function requestOnce(url: URL, headers: Record<string, string>, maxBytes: number, timeoutMs: number): Promise<OnceResult> {
  return new Promise((resolve) => {
    const mod = url.protocol === 'https:' ? https : http
    const host = url.hostname.replace(/^\[|\]$/g, '')
    // Literal IPs skip DNS, so check them here too (validateExternalUrl already did, but
    // this keeps the request path safe on its own).
    if (isIP(host) && isPrivateIp(host)) return resolve({ ok: false, reason: 'blocked', detail: 'Private IP not allowed' })

    let settled = false
    const done = (r: OnceResult) => { if (!settled) { settled = true; resolve(r) } }

    const req = mod.request(
      url,
      { method: 'GET', headers, lookup: guardedLookup as unknown as typeof dnsLookupCb, timeout: timeoutMs },
      (res) => {
        const status = res.statusCode ?? 0
        const contentType = String(res.headers['content-type'] ?? '')
        if (status >= 300 && status < 400) {
          res.resume()
          return done({ ok: true, status, contentType, location: res.headers.location, body: Buffer.alloc(0) })
        }
        const declared = Number(res.headers['content-length'] ?? 0)
        if (declared > maxBytes) { res.destroy(); return done({ ok: false, reason: 'too_large' }) }
        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (c: Buffer) => {
          size += c.length
          if (size > maxBytes) { res.destroy(); done({ ok: false, reason: 'too_large' }); return }
          chunks.push(c)
        })
        res.on('end', () => done({ ok: true, status, contentType, body: Buffer.concat(chunks) }))
        res.on('error', (e) => done({ ok: false, reason: 'network', detail: e.message }))
      },
    )
    const timer = setTimeout(() => { req.destroy(new Error('timeout')) }, timeoutMs)
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', (e: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      done({ ok: false, reason: e.code === 'EPRIVATEADDR' ? 'blocked' : 'network', detail: e.message })
    })
    req.on('close', () => clearTimeout(timer))
    req.end()
  })
}
