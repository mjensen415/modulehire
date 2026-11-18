/**
 * A disposable user for looking at pages in a browser:
 *   npx tsx scripts/smoke/session.ts create [resume.pdf]   → writes its cookie + id to SMOKE_SESSION_FILE
 *   npx tsx scripts/smoke/session.ts delete                → deletes it
 */
import * as fs from 'fs'
import { startSmoke } from './harness'
import { createClient } from '@supabase/supabase-js'

const FILE = process.env.SMOKE_SESSION_FILE ?? '.smoke-session.json'

async function main() {
  const [cmd, resume] = process.argv.slice(2)
  if (cmd === 'create') {
    const t = await startSmoke('visual')
    if (resume) {
      const form = new FormData()
      form.append('file', new Blob([fs.readFileSync(resume)], { type: 'application/pdf' }), resume.split('/').pop()!)
      const up = await t.json<{ resume_id: string; raw_text: string }>('/api/upload-resume', { method: 'POST', body: form })
      await t.json('/api/parse-resume?mode=json', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resume_id: up.body.resume_id, raw_text: up.body.raw_text }) })
    }
    const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0]
    const value = 'base64-' + Buffer.from(JSON.stringify(t.session)).toString('base64url')
    fs.writeFileSync(FILE, JSON.stringify({ userId: t.userId, email: t.email, name: `sb-${ref}-auth-token`, value }))
    console.log(`session for ${t.email} written to ${FILE}`)
  } else if (cmd === 'delete') {
    const { userId, email } = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    for (const bucket of ['resumes', 'temp', 'documents']) {
      const { data: files } = await admin.storage.from(bucket).list(userId, { limit: 1000 })
      if (files?.length) await admin.storage.from(bucket).remove(files.map(f => `${userId}/${f.name}`))
    }
    await admin.from('users').delete().eq('id', userId)
    await admin.auth.admin.deleteUser(userId)
    fs.unlinkSync(FILE)
    console.log(`deleted ${email}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
