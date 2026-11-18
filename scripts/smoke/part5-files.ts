/**
 * Part 5: Files lists every document plus tailored resumes with kind, date and job; Download works;
 * deleting a source document keeps its modules by default (or removes them when asked); the
 * sidebar reads Home, Jobs, Library, Resumes, Interviews, Files, Settings.
 *   npx tsx scripts/smoke/part5-files.ts
 */
import * as fs from 'fs'
import { startSmoke, check, summary } from './harness'

async function main() {
  const t = await startSmoke('part5')
  try {
    await t.json('/api/my-modules') // default profile
    const { data: profile } = await t.admin.from('users').select('active_profile_id').eq('id', t.userId).single()

    const resumeForm = new FormData()
    resumeForm.append('file', new Blob([fs.readFileSync('test-resumes/tessa-lindqvist-perfect-anthropic.pdf')], { type: 'application/pdf' }), 'tessa.pdf')
    const up = await t.json<{ document_id: string; resume_id: string }>('/api/upload-resume', { method: 'POST', body: resumeForm })
    const { data: job } = await t.admin.from('job_experiences').insert({ user_id: t.userId, company: 'Fieldnote AI', title: 'Head of Community', start_date: '2022-01-01' }).select('id').single()
    const reviewForm = new FormData()
    reviewForm.append('file', new Blob([fs.readFileSync('test-resumes/review-fixture.pdf')], { type: 'application/pdf' }), 'review-fixture.pdf')
    reviewForm.append('kind', 'performance_review')
    const rev = await t.json<{ document: { id: string } }>('/api/upload-document', { method: 'POST', body: reviewForm })
    await t.admin.from('documents').update({ job_experience_id: job!.id }).eq('id', rev.body.document.id)

    const mod = (title: string, docId: string) => ({ user_id: t.userId, profile_id: profile?.active_profile_id, title, content: `${title}.`, type: 'experience', status: 'confirmed', source_document_id: docId })
    await t.admin.from('modules').insert([mod('From review 1', rev.body.document.id), mod('From review 2', rev.body.document.id), mod('From resume 1', up.body.document_id), mod('From resume 2', up.body.document_id)])
    const { data: app } = await t.admin.from('job_applications').insert({ user_id: t.userId, company: 'Brightline Health', title: 'Head of Community', status: 'interviewing' }).select('id').single()
    const { data: emailDoc } = await t.admin.from('documents').insert({ user_id: t.userId, kind: 'interview_email', filename: 'Panel · Brightline Health (email)', raw_text: 'Hi, your panel is on Friday at 2pm.' }).select('id').single()
    await t.admin.from('interviews').insert({ user_id: t.userId, job_application_id: app!.id, round_name: 'Panel', source_document_id: emailDoc!.id })
    const { data: gen } = await t.admin.from('generated_resumes').insert({ user_id: t.userId, title: 'Tessa Lindqvist · Brightline', is_temp: false }).select('id').single()

    type F = { id: string; type: string; kind: string; kind_label: string; name: string; job: string | null; module_count: number }
    const list = await t.json<{ files: F[] }>('/api/files')
    const files = list.body.files
    console.log('  info  ' + files.map(f => `${f.kind_label}: ${f.name} [${f.job ?? '-'}] ${f.module_count}`).join(' | '))
    const labels = new Set(files.map(f => f.kind_label))
    check(['Resume', 'Performance review', 'Interview email', 'Tailored resume'].every(l => labels.has(l)), 'every kind is listed with its chip label')
    const review = files.find(f => f.id === rev.body.document.id)!
    check(review.job === 'Head of Community · Fieldnote AI' && review.module_count === 2, 'review shows its job and module count')
    check(files.find(f => f.id === emailDoc!.id)?.job === 'Head of Community · Brightline Health', 'interview email shows its job')
    check(files.some(f => f.id === gen!.id && f.type === 'generated'), 'tailored resume listed')

    const dl = await t.api(`/api/files/download?type=document&id=${rev.body.document.id}`)
    check(dl.status === 307 || dl.status === 302, `download redirects to a signed URL (${dl.status})`)
    const signed = dl.headers.get('location')
    const bytes = signed ? Buffer.from(await (await fetch(signed)).arrayBuffer()) : Buffer.alloc(0)
    check(bytes.subarray(0, 4).toString() === '%PDF', 'the signed URL serves the PDF')
    const txt = await t.api(`/api/files/download?type=document&id=${emailDoc!.id}`)
    check(txt.status === 200 && (await txt.text()).includes('panel is on Friday'), 'pasted email downloads as text')
    const other = await startSmoke('part5b')
    try {
      const cross = await other.api(`/api/files/download?type=document&id=${rev.body.document.id}`)
      check(cross.status === 404, 'another user cannot download it')
    } finally { await other.cleanup() }

    // Delete the review, keeping modules (the default).
    const d1 = await t.json(`/api/documents/${rev.body.document.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    check(d1.status === 200, 'delete review')
    const { count: keptCount } = await t.admin.from('modules').select('id', { count: 'exact', head: true }).eq('source_document_id', rev.body.document.id).is('deleted_at', null)
    check(keptCount === 2, 'its modules are kept by default')
    const { data: delRow } = await t.admin.from('documents').select('deleted_at, file_url, raw_text').eq('id', rev.body.document.id).single()
    check(delRow?.deleted_at && !delRow.file_url && !delRow.raw_text, 'file and text removed, row soft-deleted')
    const { data: left } = await t.admin.storage.from('documents').list(t.userId)
    check((left ?? []).length === 0, 'stored file removed')

    // Delete the resume and its modules.
    const d2 = await t.json<{ modules_removed: number }>(`/api/documents/${up.body.document_id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keep_modules: false }) })
    check(d2.status === 200 && d2.body.modules_removed === 2, `delete resume and its 2 modules (${d2.body.modules_removed})`)

    await t.json('/api/my-resumes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: gen!.id }) })
    const after = await t.json<{ files: F[] }>('/api/files')
    check(after.body.files.length === 1 && after.body.files[0].kind === 'interview_email', 'only the interview email is left')

    // Free document limit still counts the deleted review.
    const again = new FormData()
    again.append('file', new Blob([fs.readFileSync('test-resumes/review-fixture.pdf')], { type: 'application/pdf' }), 'r2.pdf')
    again.append('kind', 'other')
    const second = await t.json('/api/upload-document', { method: 'POST', body: again })
    const third = await t.json<{ code: string }>('/api/upload-document', { method: 'POST', body: again })
    check(second.status === 200 && third.status === 403, 'deleting does not reset the Free document limit')

    const html = await (await t.api('/files')).text()
    const order = ['Home', 'Jobs', 'Library', 'Resumes', 'Interviews', 'Files', 'Settings'].map(l => html.indexOf(`</span>${l}</a>`))
    check(order.every(i => i > 0) && order.every((v, i) => i === 0 || v > order[i - 1]), `sidebar order Home…Settings (${order.join(',')})`)
  } finally {
    await t.cleanup()
  }
  process.exit(summary() ? 1 : 0)
}
main().catch(e => { console.error(e); process.exit(1) })
