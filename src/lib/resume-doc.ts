// The resume as a live document: the source of truth for the editor on /resumes/[id] and for
// every download (files are rendered from this on demand, never stored as the master copy).
// Client-safe — no server imports — so the editor shares these types and the validator.
import { z } from 'zod'
import { nanoid } from 'nanoid'

export const RESUME_FORMATS = ['classic', 'tech', 'combination', 'executive', 'minimal', 'two-column'] as const
export type ResumeDocFormat = typeof RESUME_FORMATS[number]

const BlockSchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().max(2000),
  // Provenance: the module this line was written from. null for header/education lines.
  module_id: z.string().max(64).nullable(),
  // What generation produced, for "↺ Original".
  original: z.string().max(2000),
})

const ResumeDocSchema = z.object({
  header: z.object({
    name: z.string().max(200),
    title: z.string().max(200),
    // The display line the editor shows; contact_fields feed the templates, which lay the
    // fields out differently per format.
    contact: z.string().max(500),
    contact_fields: z.object({
      email: z.string().max(200),
      phone: z.string().max(100),
      location: z.string().max(200),
      linkedin: z.string().max(300),
    }),
  }),
  summary: BlockSchema,
  experience: z.array(z.object({
    job_id: z.string().max(200),
    company: z.string().max(300),
    title: z.string().max(300),
    dates: z.string().max(100),
    bullets: z.array(BlockSchema).max(40),
  })).max(40),
  // Combination format only: one skills-first section per module.
  skill_sections: z.array(z.object({
    id: z.string().min(1).max(64),
    category: z.string().max(200),
    module_id: z.string().max(64).nullable(),
    bullets: z.array(BlockSchema).max(20),
  })).max(40),
  skills: z.array(z.string().max(200)).max(100),
  education: z.array(BlockSchema).max(20),
  awards: z.string().max(4000),
  format: z.enum(RESUME_FORMATS),
  bullet_style: z.string().max(4),
})

export type Block = z.infer<typeof BlockSchema>
export type ResumeDoc = z.infer<typeof ResumeDocSchema>
export type ExperienceEntry = ResumeDoc['experience'][number]
export type SkillSection = ResumeDoc['skill_sections'][number]

export function parseResumeDoc(raw: unknown): { ok: true; doc: ResumeDoc } | { ok: false; error: string } {
  const result = ResumeDocSchema.safeParse(raw)
  if (result.success) return { ok: true, doc: result.data }
  return { ok: false, error: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).slice(0, 5).join('; ') }
}

export function makeBlock(text: string, moduleId: string | null = null): Block {
  return { id: nanoid(10), text, module_id: moduleId, original: text }
}

export function contactLine(fields: ResumeDoc['header']['contact_fields']): string {
  return [fields.email, fields.phone, fields.location, fields.linkedin].filter(Boolean).join(' · ')
}

/** Every editable block, in reading order, with where it lives. */
export function allBlocks(doc: ResumeDoc): { block: Block; section: 'summary' | 'experience' | 'skill_section' | 'education'; groupIndex: number }[] {
  return [
    ...(doc.summary.text ? [{ block: doc.summary, section: 'summary' as const, groupIndex: -1 }] : []),
    ...doc.skill_sections.flatMap((s, i) => s.bullets.map(block => ({ block, section: 'skill_section' as const, groupIndex: i }))),
    ...doc.experience.flatMap((e, i) => e.bullets.map(block => ({ block, section: 'experience' as const, groupIndex: i }))),
    ...doc.education.map(block => ({ block, section: 'education' as const, groupIndex: -1 })),
  ]
}

export function findBlock(doc: ResumeDoc, blockId: string): Block | null {
  return allBlocks(doc).find(b => b.block.id === blockId)?.block ?? null
}

/** Returns a new doc with `fn` applied to every block (fn returns the block unchanged to skip). */
export function mapBlocks(doc: ResumeDoc, fn: (b: Block) => Block): ResumeDoc {
  return {
    ...doc,
    summary: fn(doc.summary),
    experience: doc.experience.map(e => ({ ...e, bullets: e.bullets.map(fn) })),
    skill_sections: doc.skill_sections.map(s => ({ ...s, bullets: s.bullets.map(fn) })),
    education: doc.education.map(fn),
  }
}

export function updateBlockText(doc: ResumeDoc, blockId: string, text: string): ResumeDoc {
  return mapBlocks(doc, b => (b.id === blockId ? { ...b, text } : b))
}

/** All the text a reader (or an ATS) sees, for live fit scoring. */
export function docText(doc: ResumeDoc): string {
  return [
    doc.header.title,
    doc.summary.text,
    ...doc.skill_sections.flatMap(s => [s.category, ...s.bullets.map(b => b.text)]),
    ...doc.experience.flatMap(e => [e.title, e.company, ...e.bullets.map(b => b.text)]),
    doc.skills.join(', '),
    ...doc.education.map(b => b.text),
    doc.awards,
  ].filter(Boolean).join('\n')
}

/** Ids of modules with at least one line on the resume. */
export function modulesOnResume(doc: ResumeDoc): Set<string> {
  return new Set(allBlocks(doc).map(b => b.block.module_id).filter((id): id is string => !!id))
}

/** The resume's sections as scoring evidence (server fit uses the match report's scorer). */
export function docEvidence(doc: ResumeDoc): { id: string; title: string; content: string }[] {
  const lines = (blocks: Block[]) => blocks.map(b => b.text.trim()).filter(Boolean).join('\n')
  return [
    ...(doc.summary.text.trim() ? [{ id: 'summary', title: 'Summary', content: doc.summary.text.trim() }] : []),
    ...doc.experience.map((e, i) => ({ id: `job-${i}`, title: [e.title, e.company].filter(Boolean).join(', ') || 'Experience', content: lines(e.bullets) })),
    ...doc.skill_sections.map((s, i) => ({ id: `skills-${i}`, title: s.category || 'Skills', content: lines(s.bullets) })),
    ...(doc.skills.length > 0 ? [{ id: 'skills', title: 'Skills', content: doc.skills.join(', ') }] : []),
    ...(doc.education.length > 0 ? [{ id: 'education', title: 'Education', content: lines(doc.education) }] : []),
    ...(doc.awards.trim() ? [{ id: 'awards', title: 'Awards', content: doc.awards.trim() }] : []),
  ].filter(item => item.content)
}

/** A suggested change, as an operation on one block (POST /api/resume-docs/[id]/suggestions). */
export type BlockSuggestion = {
  block_id: string
  new_text: string
  reason: string
  module_id: string | null
  /** The line's text the suggestion was written against; the editor marks it stale if it changed. */
  based_on: string
}
