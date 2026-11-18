/**
 * Part 2: import a performance review. The fixture review (Fieldnote AI, 2024) should produce 4-8
 * drafts with quotes, all attached to the chosen job; resume uploads also write a documents row;
 * Free allows 2 other documents.   npx tsx scripts/smoke/part2-documents.ts
 */
import * as fs from 'fs'
import { startSmoke, check, summary, type Smoke } from './harness'

async function uploadDoc(t: Smoke, file: string, name: string, kind = 'performance_review') {
  const form = new FormData()
  form.append('file', new Blob([fs.readFileSync(file)], { type: 'application/pdf' }), name)
  form.append('kind', kind)
  return t.json<{ document: { id: string; period_label: string | null }; suggested_job_id: string | null; jobs: Array<{ id: string; company: string }>; code?: string }>(
    '/api/upload-document', { method: 'POST', body: form })
}

async function main() {
  const t = await startSmoke('part2')
  try {
    // A resume first, so there is work history (and check its documents row).
    const form = new FormData()
    form.append('file', new Blob([fs.readFileSync('test-resumes/tessa-lindqvist-perfect-anthropic.pdf')], { type: 'application/pdf' }), 'tessa-lindqvist.pdf')
    const up = await t.json<{ resume_id: string; document_id: string; raw_text: string }>('/api/upload-resume', { method: 'POST', body: form })
    check(up.status === 200 && up.body.document_id, 'resume upload writes a documents row')
    await t.json('/api/parse-resume?mode=json', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resume_id: up.body.resume_id, raw_text: up.body.raw_text }) })
    const { count: linked } = await t.admin.from('modules').select('id', { count: 'exact', head: true }).eq('user_id', t.userId).eq('source_document_id', up.body.document_id)
    check((linked ?? 0) > 0, `resume modules point at their document (${linked})`)

    // The review.
    const doc = await uploadDoc(t, 'test-resumes/review-fixture.pdf', 'review-fixture.pdf')
    check(doc.status === 200, `upload-document 200 (${doc.status})`)
    const fieldnote = doc.body.jobs.find(j => /fieldnote/i.test(j.company))
    check(fieldnote && doc.body.suggested_job_id === fieldnote.id, `suggests the job whose dates hold 2024 (${doc.body.document.period_label})`)
    const jobId = fieldnote?.id ?? doc.body.suggested_job_id!

    const parsed = await t.json<{ modules: Array<{ id: string; title: string }> }>('/api/parse-document', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_id: doc.body.document.id, job_experience_id: jobId }),
    })
    check(parsed.status === 200, `parse-document 200 (${parsed.status})`)
    const ids = (parsed.body.modules ?? []).map(m => m.id)
    console.log('  info  ' + (parsed.body.modules ?? []).map(m => m.title).join(' | '))
    check(ids.length >= 4 && ids.length <= 8, `4 to 8 drafts (${ids.length})`)

    const { data: rows } = await t.admin.from('modules').select('id, status, source_quote, source_document_id, content').in('id', ids)
    check((rows ?? []).every(r => r.status === 'draft'), 'all drafts')
    check((rows ?? []).every(r => r.source_document_id === doc.body.document.id), 'all carry source_document_id')
    const quoted = (rows ?? []).filter(r => r.source_quote).length
    check(quoted >= ids.length - 1, `quotes on ${quoted}/${ids.length}`)
    const text = (rows ?? []).map(r => r.content).join(' ').toLowerCase()
    check(!/exceeds expectations|pleasure to work|apac/.test(text), 'skips ratings, opinions and future goals')
    const { data: assign } = await t.admin.from('module_job_assignments').select('module_id, job_id').in('module_id', ids)
    check((assign ?? []).length === ids.length && (assign ?? []).every(a => a.job_id === jobId), 'all attached to the chosen job')

    const queue = await t.json<{ drafts: Array<{ id: string; source: { kind: string; label: string } }> }>('/api/modules/review-queue')
    const fromReview = queue.body.drafts.filter(d => ids.includes(d.id))
    check(fromReview.length === ids.length && fromReview.every(d => d.source.kind === 'document' && d.source.label === 'review-fixture.pdf'), 'queue labels them "From review-fixture.pdf"')
    const bulk = await t.json<{ confirmed: string[] }>('/api/modules/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source_document_id: doc.body.document.id }) })
    check(bulk.body.confirmed?.length === ids.length, 'Confirm all from this upload confirms exactly that document')

    // Free: 2 other documents, the third is refused.
    const second = await uploadDoc(t, 'test-resumes/review-fixture.pdf', 'brag.pdf', 'brag_doc')
    check(second.status === 200, 'second other document allowed')
    const third = await uploadDoc(t, 'test-resumes/review-fixture.pdf', 'third.pdf', 'other')
    check(third.status === 403 && third.body.code === 'DOCUMENT_LIMIT_REACHED', `third refused on Free (${third.status})`)

    // documents can't be written with the user's own token.
    const { createClient } = await import('@supabase/supabase-js')
    const userClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: `Bearer ${t.session.access_token}` } } })
    const { error: writeErr } = await userClient.from('documents').update({ file_url: 'x' }).eq('id', doc.body.document.id)
    const { error: delErr } = await userClient.from('documents').delete().eq('id', doc.body.document.id)
    check(writeErr && delErr, 'users cannot update or delete documents rows directly')
  } finally {
    await t.cleanup()
  }
  process.exit(summary() ? 1 : 0)
}
main().catch(e => { console.error(e); process.exit(1) })
