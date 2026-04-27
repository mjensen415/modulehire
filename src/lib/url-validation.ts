import { lookup } from 'dns/promises'

const BLOCKED_HOSTS = new Set(['localhost', '0.0.0.0', 'metadata.google.internal'])

function isPrivateIp(ip: string): boolean {
  if (ip.startsWith('127.') || ip.startsWith('10.')) return true
  if (ip.startsWith('192.168.')) return true
  if (ip === '0.0.0.0') return true
  if (ip.startsWith('169.254.')) return true // link-local + AWS metadata 169.254.169.254
  const m = ip.match(/^172\.(\d+)\./)
  if (m) {
    const oct = parseInt(m[1], 10)
    if (oct >= 16 && oct <= 31) return true
  }
  // IPv6 loopback / link-local / unique-local
  if (ip === '::1' || ip === '::') return true
  const lower = ip.toLowerCase()
  if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true
  return false
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string }

/**
 * Validates that a URL is safe to fetch from a server context — blocks SSRF
 * targets like loopback, RFC1918, link-local, and the AWS/GCP metadata endpoints.
 * Resolves DNS to catch hosts that point at private IPs.
 */
export async function validateExternalUrl(raw: unknown): Promise<UrlCheck> {
  if (typeof raw !== 'string' || !raw) return { ok: false, reason: 'Invalid URL' }

  let parsed: URL
  try { parsed = new URL(raw) } catch { return { ok: false, reason: 'Invalid URL' } }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'Only http(s) URLs are allowed' }
  }

  const host = parsed.hostname.toLowerCase()
  if (BLOCKED_HOSTS.has(host)) return { ok: false, reason: 'Host not allowed' }

  // Numeric IP supplied directly
  if (/^[\d.]+$/.test(host) || host.includes(':')) {
    if (isPrivateIp(host)) return { ok: false, reason: 'Private IP not allowed' }
  } else {
    try {
      const { address } = await lookup(host)
      if (isPrivateIp(address)) return { ok: false, reason: 'Host resolves to a private IP' }
    } catch {
      return { ok: false, reason: 'Could not resolve host' }
    }
  }

  return { ok: true, url: parsed }
}
