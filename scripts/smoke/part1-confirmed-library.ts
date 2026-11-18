/**
 * Part 1: upload a resume → every new module is a draft → generating refuses → confirm 5 →
 * only those 5 can appear on the resume.   npx tsx scripts/smoke/part1-confirmed-library.ts
 */
import * as fs from 'fs'
import { startSmoke, ndjson, check, summary } from './harness'

async function main() {
  const t = await startSmoke('part1')
  try {
    // Upload + parse (the same two calls /upload makes).
    const pdf = fs.readFileSync('test-resumes/tessa-lindqvist-perfect-anthropic.pdf')
    const form = new FormData()
    form.append('file', new Blob([pdf], { type: 'application/pdf' }), 'tessa-lindqvist.pdf')
    const up = await t.json<{ resume_id: string; raw_text: string }>('/api/upload-resume', { method: 'POST', body: form })
    check(up.status === 200 && up.body.resume_id, `upload-resume 200 (${up.status})`)
    const parse = await t.json<{ modules: unknown[] }>('/api/parse-resume?mode=json', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume_id: up.body.resume_id, raw_text: up.body.raw_text }),
    })
    check(parse.status === 200, `parse-resume 200 (${parse.status})`)

    const { data: mods } = await t.admin.from('modules').select('id, status, source_quote, deleted_at').eq('user_id', t.userId)
    const all = mods ?? []
    check(all.length >= 5, `parsed ${all.length} modules`)
    check(all.every(m => m.status === 'draft'), 'every new module is a draft')
    const quoted = all.filter(m => m.source_quote)
    console.log(`  info  ${quoted.length}/${all.length} have a verified source_quote`)
    check(quoted.length >= Math.ceil(all.length * 0.6), 'most modules carry a verified source_quote')

    const jd = fs.readFileSync('scripts/eval/jds/franklin-templeton-head-of-ai-community.txt', 'utf8')

    // Gate: nothing confirmed yet.
    const blocked = await t.json<{ code?: string }>('/api/jobs/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raw_text: jd }),
    })
    check(blocked.status === 409 && blocked.body.code === 'confirm_modules_first', `jobs/start refuses with drafts only (${blocked.status} ${blocked.body.code})`)
    const lib0 = await t.json<{ modules: unknown[] }>('/api/my-modules')
    check(lib0.body.modules.length === 0, 'library lists no usable modules yet')
    const queue = await t.json<{ total: number; drafts: Array<{ id: string; source: { kind: string } }> }>('/api/modules/review-queue')
    check(queue.body.total === all.length, `review queue holds all ${all.length} drafts`)

    // Confirm 5: 2 one at a time, 1 edited then confirmed, 2 in bulk. Reject 1.
    const ids = queue.body.drafts.map(d => d.id)
    const five = ids.slice(0, 5)
    for (const id of five.slice(0, 2)) {
      const r = await t.json(`/api/modules/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'confirmed' }) })
      check(r.status === 200, `confirm ${id.slice(0, 8)}`)
    }
    const ed = await t.json(`/api/modules/${five[2]}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Edited title', status: 'confirmed' }) })
    check(ed.status === 200, 'edit then confirm')
    const bulk = await t.json<{ confirmed: string[] }>('/api/modules/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: five.slice(3, 5) }) })
    check(bulk.body.confirmed?.length === 2, 'bulk confirm 2')
    if (ids[5]) {
      const rej = await t.json(`/api/modules/${ids[5]}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'rejected' }) })
      const { data: r } = await t.admin.from('modules').select('status, deleted_at').eq('id', ids[5]).single()
      check(rej.status === 200 && r?.status === 'rejected' && r?.deleted_at, '"Not true" rejects and soft-deletes')
    }
    const lib1 = await t.json<{ modules: Array<{ id: string }> }>('/api/my-modules')
    check(lib1.body.modules.length === 5, `library now lists 5 (${lib1.body.modules.length})`)

    // A draft id sent straight to generate-resume is ignored.
    const draftOnly = ids.slice(6, 8)
    if (draftOnly.length) {
      const g = await t.json<{ code?: string }>('/api/generate-resume', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module_ids: draftOnly, jd_id: '00000000-0000-0000-0000-000000000000' }),
      })
      check(g.status === 404 || g.status === 409 || g.status === 400, `generate-resume with drafts does not build (${g.status})`)
    }

    // Build a resume from the posting; only the 5 can appear.
    const res = await t.api('/api/jobs/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raw_text: jd }) })
    const lines = await ndjson(res)
    const err = lines.find(l => l.type === 'error')
    if (err) console.log('  info  stream error', err)
    let doc = lines.find(l => l.type === 'document') as { resume_id?: string } | undefined
    if (!doc && lines.find(l => l.type === 'need_title')) {
      const jdId = (lines.find(l => l.type === 'need_title') as { jd_id: string }).jd_id
      await t.admin.from('job_descriptions').update({ extracted_job_title: 'Head of AI Community' }).eq('id', jdId)
      const again = await ndjson(await t.api('/api/jobs/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jd_id: jdId }) }))
      doc = again.find(l => l.type === 'document') as { resume_id?: string } | undefined
    }
    check(doc?.resume_id, 'resume generated after confirming')
    if (doc?.resume_id) {
      const { data: gr } = await t.admin.from('generated_resumes').select('module_ids_used').eq('id', doc.resume_id).single()
      const used: string[] = gr?.module_ids_used ?? []
      const { data: rd } = await t.admin.from('resume_documents').select('doc').eq('generated_resume_id', doc.resume_id).maybeSingle()
      const blockMods = new Set<string>()
      JSON.stringify(rd?.doc ?? {}).replace(/"module_id":"([0-9a-f-]{36})"/g, (_m, id) => { blockMods.add(id); return '' })
      console.log(`  info  used ${used.length} modules, ${blockMods.size} linked on the page`)
      check(used.length > 0 && used.every(id => five.includes(id)), 'module_ids_used ⊆ the 5 confirmed')
      check([...blockMods].every(id => five.includes(id)), 'every line on the page links to a confirmed module')
    }
  } finally {
    await t.cleanup()
  }
  process.exit(summary() ? 1 : 0)
}
main().catch(e => { console.error(e); process.exit(1) })
