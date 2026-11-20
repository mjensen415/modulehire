// AES-256-GCM for third-party credentials we must be able to read back (an org's Greenhouse
// client secret). The key comes from INTEGRATIONS_SECRET_KEY when set, otherwise it is derived
// from SUPABASE_SERVICE_ROLE_KEY with HKDF, so no new env var is needed to ship. Rotating either
// key makes stored secrets unreadable: orgs then reconnect (the connector reports it plainly).
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto'

const VERSION = 'v1'

function key(): Buffer {
  const base = process.env.INTEGRATIONS_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base) throw new Error('No key material for integration secrets')
  return Buffer.from(hkdfSync('sha256', base, 'modulehire-integrations', 'org_integrations.secret', 32))
}

export function sealSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.')
}

export function openSecret(sealed: string): string {
  const [v, iv, tag, ct] = sealed.split('.')
  if (v !== VERSION || !iv || !tag || !ct) throw new Error('Unreadable secret')
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8')
}
