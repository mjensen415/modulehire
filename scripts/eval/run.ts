/**
 * Regression suite for parsing and scoring, from test-resumes/answer-key-jd-levels.md.
 *
 *   npm run eval            (or: npx tsx scripts/eval/run.ts)
 *
 * Runs the real pipeline (resume text extraction, parseModules, JD criteria, criteria scoring)
 * in dry-run mode: nothing is written to the database and no account is needed. It does call
 * the AI (Haiku) — roughly 60 calls per run — so it is not part of CI.
 *
 * Checks, per fixture:
 *   1. jobs   — company, title (where it tells two roles apart) and start year vs the answer key
 *   2. excluded — no modules from Objective, Interests, References or Earlier Career
 *   3. numbers — no module contains a number missing from the source text
 *   4. scoring — perfect > director > C-level > poor on each JD; each resume higher on its own JD
 *   5. scanned — the image-only PDF is reported as unreadable, not parsed
 * Output: a pass/fail table on stdout and scripts/eval/last-run.json. Exit code 1 on any fail.
 *
 * Not covered: numbers in generated resume bullets (generation needs a signed-in request; the
 * server-side fact check in src/lib/fact-check.ts guards those).
 */
import * as dotenv from 'dotenv'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import type { SupabaseClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(__dirname, '../../.env.local'), quiet: true } as never)

// unpdf calls Promise.try, which Node 22 lacks (production runs newer Node). Polyfill locally.
if (!('try' in Promise)) {
  (Promise as unknown as { try: (fn: (...a: unknown[]) => unknown, ...args: unknown[]) => Promise<unknown> }).try =
    (fn, ...args) => new Promise(resolve => resolve(fn(...args)))
}

import { extractResumeText, isUnreadable } from '../../src/lib/resume-text'
import { parseModules } from '../../src/lib/parse-modules'
import { extractJdCriteria } from '../../src/lib/jd-criteria'
import { scoreCriteria } from '../../src/lib/criteria-score'
import { normalizeCompany, parseResumeDate } from '../../src/lib/resume-dates'
import type { JdCriterion } from '../../src/lib/dimensions'
import { EXCLUDED_SECTIONS, FIXTURES, JD_FILES, JD_LABELS, LEVEL_ORDER, SCANNED_FIXTURE, type ExpectedJob, type JdKey } from './answer-key'

const ROOT = path.join(__dirname, '../..')
const FIXTURE_DIR = path.join(ROOT, 'test-resumes')
const JD_DIR = path.join(__dirname, 'jds')

type Status = 'PASS' | 'FAIL' | 'SKIP'
type Row = { fixture: string; check: string; status: Status; detail: string }
const rows: Row[] = []
const record = (fixture: string, check: string, status: Status, detail: string) => rows.push({ fixture, check, status, detail })

// parseModules never touches the client in dry-run mode.
const NO_DB = {} as SupabaseClient

type ParsedJob = { company: string; title: string | null; start_date: string | null }
type ParsedModule = { title?: unknown; content?: unknown; source_company?: unknown; source_role_title?: unknown; type?: unknown; dimensions?: unknown }

const startYear = (d: string | null | undefined) => parseResumeDate(d ?? '')?.year ?? null
const titleMatches = (actual: string | null, expected: string) =>
  (actual ?? '').toLowerCase().includes(expected.toLowerCase())

function findJob(jobs: ParsedJob[], expected: ExpectedJob): ParsedJob | undefined {
  return jobs.find(j => {
    if (expected.company && normalizeCompany(j.company) !== normalizeCompany(expected.company)) {
      // Allow "Brightwire" to match "Brightwire Inc", "Harbor and Lane" to match "Harbor & Lane".
      const a = normalizeCompany(j.company), b = normalizeCompany(expected.company)
      if (!a.includes(b) && !b.includes(a)) return false
    }
    if (expected.title && !titleMatches(j.title, expected.title)) return false
    if (expected.start && startYear(j.start_date) !== expected.start) return false
    return true
  })
}

// The text under each excluded heading (Objective, Interests, References, Earlier Career), up
// to the next heading. PDF text usually arrives as one run with no line breaks, so headings are
// found inline: runs of capitalized words like "EARLIER CAREER" or "EDUCATION AND CERTIFICATIONS".
function excludedSections(text: string): { heading: string; body: string }[] {
  const headingRe = /\b(?:[A-Z][A-Z&/]+(?:\s+(?:AND|&|OF)?\s*[A-Z][A-Z&/]+)*)\b/g
  const headings: { at: number; end: number; label: string }[] = []
  for (const m of text.matchAll(headingRe)) {
    if (m[0].replace(/[^A-Z]/g, '').length >= 6) headings.push({ at: m.index!, end: m.index! + m[0].length, label: m[0] })
  }
  // Title-case headings on their own line (DOCX text keeps line breaks).
  for (const m of text.matchAll(/^(?:Career Objective|Objective|Interests(?: (?:&|and) Hobbies)?|Hobbies|References|Earlier Career)\s*$/gim)) {
    headings.push({ at: m.index!, end: m.index! + m[0].length, label: m[0] })
  }
  headings.sort((a, b) => a.at - b.at)
  const out: { heading: string; body: string }[] = []
  headings.forEach((h, i) => {
    if (!EXCLUDED_SECTIONS.test(h.label)) return
    const next = headings.slice(i + 1).find(n => n.at > h.end)
    out.push({ heading: h.label.trim().slice(0, 30), body: text.slice(h.end, next ? next.at : text.length) })
  })
  return out
}

const words = (s: string) => (s.toLowerCase().match(/[a-z]{4,}/g) ?? [])

function moduleFromSection(m: ParsedModule, sections: { heading: string; body: string }[]): string | null {
  const w = words(String(m.content ?? ''))
  if (w.length < 4) return null
  for (const s of sections) {
    const bodyWords = new Set(words(s.body))
    if (w.filter(x => bodyWords.has(x)).length / w.length >= 0.7) return s.heading
  }
  return null
}

function inventedNumbers(m: ParsedModule, source: string): string[] {
  const flat = source.replace(/(\d),(?=\d{3}\b)/g, '$1')
  return (String(m.content ?? '').match(/\d+(?:[.,]\d+)*/g) ?? [])
    .map(n => n.replace(/,(?=\d{3}\b)/g, ''))
    .filter(n => !new RegExp(`(?<![\\d.])${n.replace('.', '\\.')}(?![\\d])`).test(flat))
}

async function main() {
  const started = Date.now()
  const jdTexts: Partial<Record<JdKey, string>> = {}
  for (const key of ['A', 'B'] as JdKey[]) {
    const file = path.join(JD_DIR, JD_FILES[key])
    if (existsSync(file)) jdTexts[key] = readFileSync(file, 'utf8')
    else record(`JD ${key}`, 'fixture', 'SKIP', `${JD_FILES[key]} missing; checks that need JD ${key} are skipped`)
  }

  // JD criteria, once per JD.
  const criteria: Partial<Record<JdKey, JdCriterion[]>> = {}
  for (const key of Object.keys(jdTexts) as JdKey[]) {
    criteria[key] = await extractJdCriteria(jdTexts[key]!)
    record(`JD ${key}`, 'criteria', criteria[key]!.length >= 3 ? 'PASS' : 'FAIL', `${criteria[key]!.length} criteria: ${criteria[key]!.map(c => c.label).join('; ')}`)
  }

  const details: Record<string, unknown> = {}
  const scores: Record<string, Partial<Record<JdKey, number>>> = {}

  for (const fx of FIXTURES) {
    const text = await extractResumeText(readFileSync(path.join(FIXTURE_DIR, fx.file)), fx.file)
    if (isUnreadable(text)) { record(fx.name, 'text', 'FAIL', 'no text extracted'); continue }

    const result = await parseModules(NO_DB, '', `eval-${fx.file}`, text, 'eval', undefined, { dryRun: true })
    const modules = result.modules as ParsedModule[]
    const jobs = result.dryRunJobs as ParsedJob[]

    // 1. jobs
    // An unnamed employer can't be a job record (company is required), so it's matched against
    // the outline's roles by year instead.
    const outlineAsJobs: ParsedJob[] = (result.outlineRoles ?? []).map(r => ({ company: r.company, title: r.title, start_date: r.date_start }))
    const missing = fx.jobs.filter(e => !(e.company === null ? findJob(outlineAsJobs, e) : findJob(jobs, e)))
    const fmt = (e: ExpectedJob) => `${e.company ?? '(unnamed)'}${e.title ? ` — ${e.title}` : ''}${e.start ? ` ${e.start}` : ''}`
    record(fx.name, 'jobs', missing.length === 0 ? 'PASS' : 'FAIL',
      missing.length === 0 ? `${fx.jobs.length}/${fx.jobs.length} found` : `missing ${missing.map(fmt).join('; ')} | got ${jobs.map(j => `${j.company} — ${j.title ?? ''} ${startYear(j.start_date) ?? ''}`).join('; ')}`)
    const multi = jobs.filter(j => /,|^(multiple|various|career|professional|self)\b/i.test(j.company))
    if (multi.length > 0) record(fx.name, 'no fake employers', 'FAIL', multi.map(j => j.company).join('; '))

    // 2. excluded sections
    const sections = excludedSections(text)
    const fromExcluded = modules.map(m => ({ m, s: moduleFromSection(m, sections) })).filter(x => x.s)
    record(fx.name, 'excluded sections', fromExcluded.length === 0 ? 'PASS' : 'FAIL',
      sections.length === 0 ? 'no such sections found in text'
        : fromExcluded.length === 0 ? `0 modules from ${sections.map(s => s.heading).join(', ')}`
        : fromExcluded.map(x => `"${String(x.m.title)}" from ${x.s}`).join('; '))

    // 3. numbers
    const invented = modules.map(m => ({ m, n: inventedNumbers(m, text) })).filter(x => x.n.length > 0)
    record(fx.name, 'no invented numbers', invented.length === 0 ? 'PASS' : 'FAIL',
      invented.length === 0 ? `${modules.length} modules checked` : invented.map(x => `"${String(x.m.title)}": ${x.n.join(', ')}`).join('; '))

    // 4. scoring (collected; ordering checked below)
    scores[fx.name] = {}
    const evidence = modules.map((m, i) => ({
      id: `m${i}`,
      title: String(m.title ?? ''),
      content: String(m.content ?? ''),
      dimensions: Array.isArray(m.dimensions) ? m.dimensions as string[] : null,
      label: [m.source_company, m.source_role_title].filter(Boolean).join(' — '),
    }))
    for (const key of Object.keys(criteria) as JdKey[]) {
      const report = await scoreCriteria(criteria[key]!, evidence, JD_LABELS[key], { userId: '', action: '' })
      scores[fx.name][key] = report.overall
    }

    details[fx.name] = {
      contact: { name: result.contact.full_name, email: result.contact.email },
      outline: (result.outlineRoles ?? []).map(r => `${r.company} — ${r.title ?? ''} ${r.date_start ?? ''}`),
      jobs: jobs.map(j => `${j.company} — ${j.title ?? ''} ${j.start_date ?? ''}`),
      modules: modules.map(m => ({ title: m.title, company: m.source_company, type: m.type })),
      scores: scores[fx.name],
    }
    console.error(`  parsed ${fx.name}: ${jobs.length} jobs, ${modules.length} modules, scores ${JSON.stringify(scores[fx.name])}`)
  }

  // 4. ordering on each JD, and own JD above the other.
  for (const key of Object.keys(criteria) as JdKey[]) {
    const own = LEVEL_ORDER.map(level => FIXTURES.find(f => f.jd === key && f.level === level)!)
    const vals = own.map(f => scores[f.name]?.[key])
    const ordered = vals.every((v, i) => i === 0 || (v !== undefined && vals[i - 1] !== undefined && vals[i - 1]! > v))
    record(`JD ${key}`, 'ordering', ordered ? 'PASS' : 'FAIL', own.map((f, i) => `${f.level} ${vals[i] ?? '—'}`).join(' > '))
  }
  if (criteria.A && criteria.B) {
    for (const fx of FIXTURES) {
      const other: JdKey = fx.jd === 'A' ? 'B' : 'A'
      const s = scores[fx.name] ?? {}
      const ok = s[fx.jd] !== undefined && s[other] !== undefined && s[fx.jd]! > s[other]!
      record(fx.name, 'own JD higher', ok ? 'PASS' : 'FAIL', `own ${s[fx.jd] ?? '—'} vs other ${s[other] ?? '—'}`)
    }
  } else {
    record('all', 'own JD higher', 'SKIP', 'needs both JD fixtures')
  }

  // 5. scanned PDF
  const scannedText = await extractResumeText(readFileSync(path.join(FIXTURE_DIR, SCANNED_FIXTURE)), SCANNED_FIXTURE)
  record('Kevin (scanned PDF)', 'unreadable error', isUnreadable(scannedText) ? 'PASS' : 'FAIL',
    isUnreadable(scannedText) ? 'reported as unreadable (upload returns UNREADABLE_TEXT_MESSAGE)' : `extracted ${scannedText.trim().length} chars instead`)

  // Output
  const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n))
  console.log(`\n${pad('Fixture', 22)} ${pad('Check', 20)} Result  Detail`)
  console.log('-'.repeat(110))
  for (const r of rows) console.log(`${pad(r.fixture, 22)} ${pad(r.check, 20)} ${r.status.padEnd(6)}  ${r.detail.slice(0, 200)}`)
  const failed = rows.filter(r => r.status === 'FAIL').length
  const passed = rows.filter(r => r.status === 'PASS').length
  const skipped = rows.filter(r => r.status === 'SKIP').length
  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped in ${Math.round((Date.now() - started) / 1000)}s`)

  writeFileSync(path.join(__dirname, 'last-run.json'), JSON.stringify({ ran_at: new Date().toISOString(), passed, failed, skipped, rows, details }, null, 2))
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error(err)
  process.exit(2)
})
