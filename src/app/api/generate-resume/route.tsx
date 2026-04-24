import { NextResponse } from 'next/server'
import { aiComplete } from '@/lib/ai'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAnonClient } from '@supabase/supabase-js'
import * as docx from 'docx'
import { renderToBuffer, Document as PdfDoc, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import React from 'react'

export const maxDuration = 60

type Contact = { name: string; email: string; phone?: string; linkedin?: string; location?: string }
type ResumeFormat = 'classic' | 'modern' | 'compact' | 'combination'
type Section = { heading: string; content: string }

// ─── COMBINATION TEMPLATE TYPES ───────────────────────────────────────────────
type CombinationData = {
  job_title: string
  summary: string
  skill_sections: { category: string; bullets: string[] }[]
  work_experience: { title: string; company: string; dates: string; bullets: string[] }[]
  education: { degree: string; school: string; year: string }[]
  skills_list: string[]
}

// ─── HTML PREVIEW ─────────────────────────────────────────────────────────────

function buildResumeHtml(contact: Contact, sections: Section[], format: ResumeFormat): string {
  const contactLine = [contact.email, contact.phone, contact.location, contact.linkedin].filter(Boolean).join(' · ')

  if (format === 'classic') {
    const sectionsHtml = sections.map(sec => `
      <div style="margin-bottom:22px">
        <h2 style="font-family:Georgia,serif;font-size:12.5px;font-weight:bold;font-variant:small-caps;letter-spacing:0.05em;border-bottom:1px solid #ddd;padding-bottom:4px;margin:0 0 8px 0;color:#222">${sec.heading}</h2>
        <p style="font-family:Georgia,serif;font-size:12.5px;line-height:1.65;color:#333;margin:0">${sec.content.replace(/\n/g, '<br>')}</p>
      </div>`).join('')
    return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#fff"><div style="max-width:680px;margin:0 auto;padding:48px 56px 56px;box-sizing:border-box">
      <h1 style="font-family:Georgia,serif;font-size:26px;font-weight:bold;margin:0 0 5px 0;color:#111;letter-spacing:-0.02em">${contact.name}</h1>
      <p style="font-family:Georgia,serif;font-size:10.5px;color:#777;margin:0 0 28px 0;letter-spacing:0.02em">${contactLine}</p>
      ${sectionsHtml}
    </div></body></html>`
  }

  if (format === 'modern') {
    const sectionsHtml = sections.map(sec => `
      <div style="margin-bottom:18px;border-left:3px solid #00B4B4;padding-left:12px">
        <h2 style="font-family:system-ui,sans-serif;font-size:12px;font-weight:700;margin:0 0 6px 0;color:#00B4B4;letter-spacing:0.01em">${sec.heading}</h2>
        <p style="font-family:system-ui,sans-serif;font-size:12px;line-height:1.6;color:#333;margin:0">${sec.content.replace(/\n/g, '<br>')}</p>
      </div>`).join('')
    return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#fff"><div style="max-width:680px;margin:0 auto;padding:40px 48px 48px;box-sizing:border-box">
      <h1 style="font-family:system-ui,sans-serif;font-size:24px;font-weight:800;margin:0 0 4px 0;color:#111;letter-spacing:-0.02em">${contact.name}</h1>
      <p style="font-family:system-ui,sans-serif;font-size:10.5px;color:#777;margin:0 0 24px 0">${contactLine}</p>
      ${sectionsHtml}
    </div></body></html>`
  }

  // compact
  const sectionsHtml = sections.map(sec => `
    <div style="margin-bottom:14px;border-left:2px solid #00B4B4;padding-left:10px">
      <h2 style="font-family:system-ui,sans-serif;font-size:11px;font-weight:700;margin:0 0 4px 0;color:#00B4B4;letter-spacing:0.01em">${sec.heading}</h2>
      <p style="font-family:system-ui,sans-serif;font-size:11px;line-height:1.5;color:#333;margin:0">${sec.content.replace(/\n/g, '<br>')}</p>
    </div>`).join('')
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#fff"><div style="max-width:680px;margin:0 auto;padding:32px 40px 40px;box-sizing:border-box">
    <h1 style="font-family:system-ui,sans-serif;font-size:20px;font-weight:800;margin:0 0 3px 0;color:#111;letter-spacing:-0.02em">${contact.name}</h1>
    <p style="font-family:system-ui,sans-serif;font-size:10px;color:#777;margin:0 0 18px 0">${contactLine}</p>
    ${sectionsHtml}
  </div></body></html>`
}

// ─── DOCX BUILDER ─────────────────────────────────────────────────────────────

function buildDocx(contact: Contact, sections: Section[], format: ResumeFormat, contactLine: string): docx.Document {
  const twip = (inches: number) => Math.round(inches * 1440)

  if (format === 'classic') {
    return new docx.Document({
      creator: contact.name,
      sections: [{
        properties: {
          page: { margin: { top: twip(1), right: twip(1), bottom: twip(1), left: twip(1) } },
        },
        children: [
          new docx.Paragraph({
            children: [new docx.TextRun({ text: contact.name, bold: true, size: 36, font: 'Times New Roman' })],
            spacing: { after: 80 },
          }),
          new docx.Paragraph({
            children: [new docx.TextRun({ text: contactLine, size: 18, color: '777777', font: 'Times New Roman' })],
            spacing: { after: 280 },
          }),
          ...sections.flatMap(sec => [
            new docx.Paragraph({
              children: [new docx.TextRun({ text: sec.heading.toUpperCase(), bold: true, size: 22, font: 'Times New Roman', smallCaps: true })],
              spacing: { before: 280, after: 80, line: 276 },
              border: { bottom: { color: 'cccccc', size: 4, style: docx.BorderStyle.SINGLE, space: 4 } },
            }),
            new docx.Paragraph({
              children: [new docx.TextRun({ text: sec.content, size: 22, font: 'Times New Roman' })],
              spacing: { after: 120, line: 276 },
            }),
          ]),
        ],
      }],
    })
  }

  if (format === 'modern') {
    return new docx.Document({
      creator: contact.name,
      sections: [{
        properties: {
          page: { margin: { top: twip(0.75), right: twip(0.85), bottom: twip(0.75), left: twip(0.85) } },
        },
        children: [
          new docx.Paragraph({
            children: [new docx.TextRun({ text: contact.name, bold: true, size: 34, font: 'Calibri', color: '111111' })],
            spacing: { after: 60 },
          }),
          new docx.Paragraph({
            children: [new docx.TextRun({ text: contactLine, size: 18, color: '777777', font: 'Calibri' })],
            spacing: { after: 240 },
          }),
          ...sections.flatMap(sec => [
            new docx.Paragraph({
              children: [new docx.TextRun({ text: sec.heading, bold: true, size: 24, font: 'Calibri', color: '00B4B4' })],
              spacing: { before: 200, after: 60, line: 264 },
            }),
            new docx.Paragraph({
              children: [new docx.TextRun({ text: sec.content, size: 21, font: 'Calibri' })],
              spacing: { after: 100, line: 264 },
            }),
          ]),
        ],
      }],
    })
  }

  // compact
  return new docx.Document({
    creator: contact.name,
    sections: [{
      properties: {
        page: { margin: { top: twip(0.75), right: twip(0.75), bottom: twip(0.75), left: twip(0.75) } },
      },
      children: [
        new docx.Paragraph({
          children: [new docx.TextRun({ text: contact.name, bold: true, size: 30, font: 'Calibri', color: '111111' })],
          spacing: { after: 40 },
        }),
        new docx.Paragraph({
          children: [new docx.TextRun({ text: contactLine, size: 16, color: '777777', font: 'Calibri' })],
          spacing: { after: 200 },
        }),
        ...sections.flatMap(sec => [
          new docx.Paragraph({
            children: [new docx.TextRun({ text: sec.heading, bold: true, size: 22, font: 'Calibri', color: '00B4B4' })],
            spacing: { before: 160, after: 40, line: 252 },
          }),
          new docx.Paragraph({
            children: [new docx.TextRun({ text: sec.content, size: 20, font: 'Calibri' })],
            spacing: { after: 80, line: 252 },
          }),
        ]),
      ],
    }],
  })
}

// ─── COMBINATION DOCX BUILDER ────────────────────────────────────────────────

function buildDocxCombination(contact: Contact, data: CombinationData): docx.Document {
  const twip = (inches: number) => Math.round(inches * 1440)
  const CONTENT_WIDTH = 9360
  const HEADER_FILL  = 'C49098'
  const SECTION_FILL = 'EDD5D7'
  const CONTACT_FILL = 'F2F2F2'
  const noBorder = { style: docx.BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const
  const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideH: noBorder, insideV: noBorder }

  const headerTable = () => new docx.Table({
    width: { size: CONTENT_WIDTH, type: docx.WidthType.DXA },
    columnWidths: [CONTENT_WIDTH],
    borders: noBorders,
    rows: [new docx.TableRow({ children: [
      new docx.TableCell({
        width: { size: CONTENT_WIDTH, type: docx.WidthType.DXA },
        shading: { fill: HEADER_FILL, type: docx.ShadingType.CLEAR },
        margins: { top: 320, bottom: 280, left: 560, right: 560 },
        borders: noBorders,
        children: [
          new docx.Paragraph({
            alignment: docx.AlignmentType.CENTER,
            spacing: { before: 0, after: 100 },
            children: [new docx.TextRun({ text: contact.name, size: 52, bold: true, color: 'FFFFFF', font: 'Calibri' })],
          }),
          new docx.Paragraph({
            alignment: docx.AlignmentType.CENTER,
            spacing: { before: 0, after: data.summary ? 200 : 0 },
            children: [new docx.TextRun({ text: data.job_title, size: 22, color: 'F0D8DA', font: 'Calibri' })],
          }),
          ...(data.summary ? [new docx.Paragraph({
            alignment: docx.AlignmentType.CENTER,
            spacing: { before: 0, after: 0 },
            children: [new docx.TextRun({ text: data.summary, size: 19, color: 'F5E6E8', font: 'Calibri', italics: true })],
          })] : []),
        ],
      })
    ]})]
  })

  const contactBar = () => new docx.Table({
    width: { size: CONTENT_WIDTH, type: docx.WidthType.DXA },
    columnWidths: [CONTENT_WIDTH],
    borders: noBorders,
    rows: [new docx.TableRow({ children: [
      new docx.TableCell({
        width: { size: CONTENT_WIDTH, type: docx.WidthType.DXA },
        shading: { fill: CONTACT_FILL, type: docx.ShadingType.CLEAR },
        margins: { top: 120, bottom: 120, left: 360, right: 360 },
        borders: noBorders,
        children: [new docx.Paragraph({
          alignment: docx.AlignmentType.CENTER,
          children: [new docx.TextRun({
            text: [contact.phone, contact.location, contact.linkedin, contact.email].filter(Boolean).join('  |  '),
            size: 18, color: '555555', font: 'Calibri',
          })],
        })]
      })
    ]})]
  })

  const sectionHeader = (label: string) => new docx.Table({
    width: { size: CONTENT_WIDTH, type: docx.WidthType.DXA },
    columnWidths: [CONTENT_WIDTH],
    borders: noBorders,
    rows: [new docx.TableRow({ children: [
      new docx.TableCell({
        width: { size: CONTENT_WIDTH, type: docx.WidthType.DXA },
        shading: { fill: SECTION_FILL, type: docx.ShadingType.CLEAR },
        margins: { top: 100, bottom: 100, left: 160, right: 160 },
        borders: noBorders,
        children: [new docx.Paragraph({
          children: [new docx.TextRun({ text: label, bold: true, size: 22, font: 'Calibri', color: '3D2B2D' })],
        })]
      })
    ]})]
  })

  const bullet = (text: string) => new docx.Paragraph({
    numbering: { reference: 'combo-bullets', level: 0 },
    spacing: { before: 40, after: 40, line: 276 },
    children: [new docx.TextRun({ text, size: 20, font: 'Calibri', color: '222222' })],
  })

  const spacer = (space = 120) => new docx.Paragraph({ spacing: { before: 0, after: space } })

  return new docx.Document({
    numbering: {
      config: [{
        reference: 'combo-bullets',
        levels: [{ level: 0, format: docx.LevelFormat.BULLET, text: '\u2022', alignment: docx.AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 360, hanging: 220 } } } }]
      }]
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: twip(0.65), right: twip(0.65), bottom: twip(0.65), left: twip(0.65) },
        }
      },
      children: [
        headerTable(),
        spacer(80),
        contactBar(),
        spacer(200),

        sectionHeader('RELEVANT SKILLS'),
        spacer(80),
        ...data.skill_sections.flatMap(sec => [
          new docx.Paragraph({
            spacing: { before: 120, after: 60 },
            children: [new docx.TextRun({ text: sec.category, bold: true, size: 21, font: 'Calibri', color: '3D2B2D' })],
          }),
          ...sec.bullets.map(b => bullet(b)),
          spacer(80),
        ]),

        sectionHeader('WORK EXPERIENCE'),
        spacer(80),
        ...data.work_experience.flatMap(job => [
          new docx.Paragraph({
            spacing: { before: 120, after: 40 },
            tabStops: [{ type: docx.TabStopType.RIGHT, position: docx.TabStopPosition.MAX }],
            children: [
              new docx.TextRun({ text: job.title, bold: true, size: 21, font: 'Calibri', color: '222222' }),
              new docx.TextRun({ text: '\t' + job.dates, size: 19, font: 'Calibri', color: '777777', italics: true }),
            ],
          }),
          new docx.Paragraph({
            spacing: { before: 0, after: 60 },
            children: [new docx.TextRun({ text: job.company, size: 19, font: 'Calibri', color: '666666' })],
          }),
          ...job.bullets.map(b => bullet(b)),
          spacer(100),
        ]),

        ...(data.education.length > 0 ? [
          sectionHeader('EDUCATION'),
          spacer(80),
          ...data.education.map(e => new docx.Paragraph({
            spacing: { before: 100, after: 60 },
            tabStops: [{ type: docx.TabStopType.RIGHT, position: docx.TabStopPosition.MAX }],
            children: [
              new docx.TextRun({ text: `${e.degree} · ${e.school}`, bold: true, size: 20, font: 'Calibri', color: '222222' }),
              new docx.TextRun({ text: '\t' + e.year, size: 19, font: 'Calibri', color: '777777', italics: true }),
            ],
          })),
          spacer(160),
        ] : []),

        ...(data.skills_list.length > 0 ? [
          sectionHeader('SKILLS'),
          spacer(80),
          new docx.Paragraph({
            spacing: { before: 100, after: 60 },
            children: [new docx.TextRun({ text: data.skills_list.join('  ·  '), size: 20, font: 'Calibri', color: '444444' })],
          }),
        ] : []),
      ]
    }]
  })
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

const pdfStyles = StyleSheet.create({
  page: { flexDirection: 'column', backgroundColor: '#FFFFFF', padding: 40, fontFamily: 'Helvetica' },
  name: { fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  contact: { fontSize: 9, color: '#555', marginBottom: 16 },
  h2: { fontSize: 12, fontWeight: 'bold', borderBottomWidth: 1, borderBottomColor: '#ccc', paddingBottom: 2, marginTop: 14, marginBottom: 6 },
  body: { fontSize: 10, lineHeight: 1.5, color: '#222', marginBottom: 8 },
})

type EducationEntry = { school: string; degree: string; field: string; year: string }
type CoverLetterConfig = { include: boolean; tone: 'professional' | 'warm' | 'direct'; notes?: string }

const ResumePDF = ({ contact, sections }: { contact: Contact; sections: Section[] }) => (
  <PdfDoc>
    <Page size="A4" style={pdfStyles.page}>
      <Text style={pdfStyles.name}>{contact.name}</Text>
      <Text style={pdfStyles.contact}>
        {[contact.email, contact.phone, contact.location, contact.linkedin].filter(Boolean).join(' · ')}
      </Text>
      {sections.map((sec, idx) => (
        <View key={idx}>
          <Text style={pdfStyles.h2}>{sec.heading}</Text>
          <Text style={pdfStyles.body}>{sec.content}</Text>
        </View>
      ))}
    </Page>
  </PdfDoc>
)

// ─── HANDLER ──────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    let supabase = await createClient()
    let { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      const authHeader = req.headers.get('authorization')
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7)
        const authedClient = createAnonClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { global: { headers: { Authorization: `Bearer ${token}` } } }
        )
        const { data } = await authedClient.auth.getUser()
        user = data.user
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (user) supabase = authedClient as any
      }
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const {
      module_ids,
      jd_id,
      positioning_variant,
      contact,
      summary_override,
      education,
      skills,
      include_skills_section,
      include_education_section,
      include_summary,
      cover_letter,
      job_level,
      format = 'classic',
    }: {
      module_ids: string[]
      jd_id: string
      positioning_variant: string
      contact: Contact
      summary_override?: string
      education?: EducationEntry[]
      skills?: string[]
      include_skills_section: boolean
      include_education_section: boolean
      include_summary: boolean
      cover_letter?: CoverLetterConfig
      job_level?: string
      format?: ResumeFormat
    } = await req.json()

    const { data: jd, error: jdError } = await supabase
      .from('job_descriptions')
      .select('*')
      .eq('id', jd_id)
      .single()
    if (jdError) throw jdError

    const { data: modules, error: modError } = await supabase
      .from('modules')
      .select('*')
      .in('id', module_ids)
    if (modError) throw modError

    const sortedModules = module_ids.map((id: string) => modules.find(m => m.id === id)).filter(Boolean)

    const variantFraming: Record<string, string> = {
      A: 'Lead with community impact and grassroots momentum',
      B: 'Lead with leadership scale and organizational growth',
      C: 'Lead with cross-functional influence and stakeholder alignment',
      D: 'Lead with technical depth and product partnership',
    }

    const summaryInstruction = summary_override
      ? `Use this summary verbatim (do not change it): "${summary_override}"`
      : `Write a 3-4 sentence professional summary that applies this framing: ${variantFraming[positioning_variant] ?? variantFraming.A}`

    const educationText = (education as EducationEntry[] | undefined)?.length
      ? (education as EducationEntry[]).map(e => `${e.degree} in ${e.field}, ${e.school} (${e.year})`).join('\n')
      : ''

    const skillsText = (skills as string[] | undefined)?.length
      ? (skills as string[]).join(', ')
      : ''

    const levelFraming: Record<string, string> = {
      Associate: 'execution, task delivery, and team contribution',
      Manager: 'team leadership, project delivery, and operational excellence',
      'Senior Manager': 'cross-functional leadership, team scaling, and program ownership',
      Director: 'strategy, organizational impact, and cross-functional leadership',
      VP: 'executive strategy, business outcomes, and organizational transformation',
      Executive: 'vision, transformation, business outcomes, and board-level impact',
    }
    const levelInstruction = job_level && levelFraming[job_level]
      ? `Frame experience for a ${job_level}-level role. Emphasize ${levelFraming[job_level]}.`
      : ''

    const compactInstruction = format === 'compact'
      ? '\nIMPORTANT: Be extremely concise. Maximum 2 sentences per experience section. The resume must fit on one page.'
      : ''

    const roleTitle = jd.extracted_role_type ?? 'Resume'
    const resumeTitle = `${roleTitle} - ${contact.name}`
    const docxFilename = `${resumeTitle}.docx`

    // ── Combination template: separate structured prompt ──────────────────────
    let resumeHtml: string
    let docxBuffer: Buffer
    let pdfSections: Section[] = []

    if (format === 'combination') {
      const comboPrompt = `Assemble a tailored resume in structured JSON for: ${jd.extracted_role_type} at ${jd.extracted_company}.

Rules:
- Write punchy, metric-driven bullet points (start each with a strong verb)
- Mirror these JD phrases naturally: ${(jd.extracted_phrases || []).join(', ')}
${levelInstruction ? `- ${levelInstruction}` : ''}
- Summary: ${summaryInstruction}

Respond with JSON ONLY matching this exact structure:
{
  "job_title": "inferred target job title",
  "summary": "3–4 sentence professional summary",
  "skill_sections": [
    { "category": "Skill Domain Name", "bullets": ["Achievement or responsibility...", "..."] }
  ],
  "work_experience": [
    { "title": "Job Title", "company": "Company · City, State", "dates": "Mon YYYY – Mon YYYY", "bullets": ["...", "..."] }
  ],
  "education": [
    { "degree": "Degree and Major", "school": "University Name", "year": "YYYY" }
  ],
  "skills_list": ["skill1", "skill2"]
}

- skill_sections: one entry per module (use module title as category, convert content to 2–4 bullets)
- work_experience: group modules by source_company; 2–3 bullets per role
- education: ${include_education_section && educationText ? educationText : 'leave as empty array []'}
- skills_list: ${include_skills_section && skillsText ? skillsText : 'leave as empty array []'}
${!include_summary ? '- summary: set to empty string ""' : ''}

Modules:
${JSON.stringify(sortedModules.map((m: Record<string, unknown>) => ({
  title: m.title, content: m.content,
  source_company: m.source_company, source_role_title: m.source_role_title,
  date_start: m.date_start, date_end: m.date_end,
})))}
`

      const rawCombo = await aiComplete([{ role: 'user', content: comboPrompt }], 4096)
      const strippedCombo = rawCombo.replace(/```json/g, '').replace(/```/g, '')
      const cs = strippedCombo.indexOf('{'), ce = strippedCombo.lastIndexOf('}')
      if (cs === -1 || ce === -1) throw new Error(`Combination template: model did not return JSON. Got: ${strippedCombo.slice(0, 200)}`)
      const comboData: CombinationData = JSON.parse(strippedCombo.slice(cs, ce + 1).replace(/,(\s*[}\]])/g, '$1'))

      const comboDoc = buildDocxCombination(contact, comboData)
      docxBuffer = await docx.Packer.toBuffer(comboDoc) as Buffer

      // HTML preview for combination: simple representation
      const skillsHtml = comboData.skill_sections.map(sec => `
        <div style="margin-bottom:14px">
          <div style="font-weight:700;font-size:12px;color:#7A4A4E;margin-bottom:4px">${sec.category}</div>
          <ul style="margin:0;padding-left:18px">${sec.bullets.map(b => `<li style="font-size:11.5px;color:#333;line-height:1.6;margin-bottom:2px">${b}</li>`).join('')}</ul>
        </div>`).join('')
      const expHtml = comboData.work_experience.map(job => `
        <div style="margin-bottom:14px">
          <div style="display:flex;justify-content:space-between"><span style="font-weight:700;font-size:12px">${job.title}</span><span style="font-size:11px;color:#888;font-style:italic">${job.dates}</span></div>
          <div style="font-size:11px;color:#666;margin-bottom:4px">${job.company}</div>
          <ul style="margin:0;padding-left:18px">${job.bullets.map(b => `<li style="font-size:11.5px;color:#333;line-height:1.6;margin-bottom:2px">${b}</li>`).join('')}</ul>
        </div>`).join('')
      resumeHtml = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#fff;font-family:Calibri,Candara,sans-serif">
        <div style="background:#C49098;padding:28px 48px 24px;text-align:center">
          <div style="font-size:26px;font-weight:700;color:#fff;margin-bottom:4px">${contact.name}</div>
          <div style="font-size:13px;color:#F0D8DA;margin-bottom:${comboData.summary ? '12px' : '0'}">${comboData.job_title}</div>
          ${comboData.summary ? `<div style="font-size:11.5px;color:#F5E6E8;font-style:italic;max-width:560px;margin:0 auto;line-height:1.55">${comboData.summary}</div>` : ''}
        </div>
        <div style="background:#F2F2F2;padding:8px 48px;text-align:center;font-size:11px;color:#555">
          ${[contact.phone, contact.location, contact.linkedin, contact.email].filter(Boolean).join(' | ')}
        </div>
        <div style="max-width:680px;margin:0 auto;padding:20px 32px 32px">
          <div style="background:#EDD5D7;padding:6px 12px;font-weight:700;font-size:12px;color:#3D2B2D;margin-bottom:12px">RELEVANT SKILLS</div>
          ${skillsHtml}
          <div style="background:#EDD5D7;padding:6px 12px;font-weight:700;font-size:12px;color:#3D2B2D;margin:16px 0 12px">WORK EXPERIENCE</div>
          ${expHtml}
        </div>
      </body></html>`

    } else {
      // ── Original prompt for classic / modern / compact ────────────────────
      const prompt = `Assemble a tailored resume from the provided modules for the role: ${jd.extracted_role_type} at ${jd.extracted_company}.

Rules:
- Paragraph form only — no bullet points anywhere in the body
- No em dashes — use commas or restructure
- Conversational but professional tone
- Lead with what's useful to the reader
- Mirror these exact JD phrases naturally: ${(jd.extracted_phrases || []).join(', ')}
${levelInstruction ? `- ${levelInstruction}` : ''}

Summary section: ${summaryInstruction}

Experience sections: Group by source_company. For each company write a flowing paragraph covering the candidate's impact.

${include_skills_section && skillsText ? `Skills section: List these skills naturally: ${skillsText}` : ''}
${include_education_section && educationText ? `Education section: Include this education:\n${educationText}` : ''}

Respond with JSON only:
{
  "sections": [
    { "heading": "Summary", "content": "..." },
    { "heading": "<Company Name> — <Role Title>", "content": "..." }
  ]
}

Include only the sections that are asked for. Do not add extra sections.
${compactInstruction}
Modules:
${JSON.stringify(sortedModules.map((m: Record<string, unknown>) => ({ title: m.title, content: m.content, source_company: m.source_company, source_role_title: m.source_role_title, date_start: m.date_start, date_end: m.date_end })))}`

      const rawResponseText = await aiComplete([{ role: 'user', content: prompt }], 4096)
      const stripped = rawResponseText.replace(/```json/g, '').replace(/```/g, '')
      const jsonStart = stripped.indexOf('{'), jsonEnd = stripped.lastIndexOf('}')
      if (jsonStart === -1 || jsonEnd === -1) throw new Error(`Model did not return JSON. Response: ${stripped.slice(0, 200)}`)
      const cleanJson = stripped.slice(jsonStart, jsonEnd + 1)
        .replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/,(\s*[}\]])/g, '$1')
      const resumeData: { sections: Section[] } = JSON.parse(cleanJson)

      const contactLine = [contact.email, contact.phone, contact.location, contact.linkedin].filter(Boolean).join(' · ')
      const sections = resumeData.sections.filter(s => {
        if (!include_summary && s.heading.toLowerCase().includes('summary')) return false
        if (!include_skills_section && s.heading.toLowerCase().includes('skill')) return false
        if (!include_education_section && s.heading.toLowerCase().includes('education')) return false
        return true
      })

      resumeHtml = buildResumeHtml(contact, sections, format)
      pdfSections = sections
      const classicDoc = buildDocx(contact, sections, format, contactLine)
      docxBuffer = await docx.Packer.toBuffer(classicDoc) as Buffer
    }

    const pdfBuffer = await renderToBuffer(
      <ResumePDF contact={contact} sections={pdfSections} />
    )

    const resumeId = crypto.randomUUID()
    const docxPath = `${user.id}/${resumeId}.docx`
    const pdfPath = `${user.id}/${resumeId}.pdf`

    const { error: docxUploadErr } = await supabase.storage
      .from('temp')
      .upload(docxPath, docxBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
    if (docxUploadErr) throw docxUploadErr

    const { error: pdfUploadErr } = await supabase.storage
      .from('temp')
      .upload(pdfPath, pdfBuffer, { contentType: 'application/pdf' })
    if (pdfUploadErr) throw pdfUploadErr

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    const { data: savedResume, error: saveError } = await supabase
      .from('generated_resumes')
      .insert({
        id: resumeId,
        user_id: user.id,
        job_description_id: jd_id,
        title: resumeTitle,
        module_ids_used: module_ids,
        positioning_variant,
        docx_url: docxPath,
        pdf_url: pdfPath,
        is_temp: true,
        expires_at: expiresAt,
      })
      .select()
      .single()
    if (saveError) throw saveError

    const { data: docxSigned } = await supabase.storage.from('temp').createSignedUrl(docxPath, 3600)
    const { data: pdfSigned } = await supabase.storage.from('temp').createSignedUrl(pdfPath, 3600)

    let coverLetterText: string | null = null
    let coverLetterUrl: string | null = null

    if (cover_letter?.include) {
      const toneDesc: Record<string, string> = {
        professional: 'Professional and concise — clear, direct, no fluff',
        warm: 'Warm and conversational — personable, human, enthusiastic',
        direct: 'Direct and confident — bold, assured, no hedging',
      }
      const topModules = sortedModules.slice(0, 4) as Array<Record<string, unknown>>
      const clPrompt = `Write a cover letter for this candidate applying to ${jd.extracted_role_type} at ${jd.extracted_company}.

Tone: ${toneDesc[cover_letter.tone] ?? toneDesc.professional}
Candidate experience (top modules):
${topModules.map(m => `- ${m.title}: ${String(m.content).slice(0, 200)}`).join('\n')}
JD themes: ${(jd.extracted_themes || []).join(', ')}
${cover_letter.notes ? `Additional context: ${cover_letter.notes}` : ''}

Rules:
- 3 paragraphs max
- Do NOT open with "I am writing to apply" — start with something specific and compelling
- Mirror 1-2 phrases from the JD naturally
- Close with a clear call to action
- Plain text output only — no JSON, no markdown, no headers`

      coverLetterText = await aiComplete([{ role: 'user', content: clPrompt }], 1024)

      const coverPath = `${user.id}/${resumeId}-cover.txt`
      await supabase.storage.from('temp').upload(
        coverPath,
        Buffer.from(coverLetterText, 'utf-8'),
        { contentType: 'text/plain' }
      )
      const { data: coverSigned } = await supabase.storage.from('temp').createSignedUrl(coverPath, 3600)
      coverLetterUrl = coverSigned?.signedUrl ?? null
    }

    await supabase.from('usage_events').insert({ user_id: user.id, action: 'generate_resume' })

    return NextResponse.json({
      resume_id: savedResume.id,
      docx_url: docxSigned?.signedUrl,
      pdf_url: pdfSigned?.signedUrl,
      docx_filename: docxFilename,
      resume_html: resumeHtml,
      cover_letter_text: coverLetterText,
      cover_letter_url: coverLetterUrl,
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
