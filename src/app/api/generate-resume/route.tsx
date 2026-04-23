import { NextResponse } from 'next/server'
import { aiComplete } from '@/lib/ai'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAnonClient } from '@supabase/supabase-js'
import * as docx from 'docx'
import { renderToBuffer, Document as PdfDoc, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import React from 'react'

export const maxDuration = 60

type Contact = { name: string; email: string; phone?: string; linkedin?: string; location?: string }

function buildResumeHtml(contact: Contact, sections: Array<{ heading: string; content: string }>): string {
  const contactLine = [contact.email, contact.phone, contact.location, contact.linkedin].filter(Boolean).join(' · ')
  const sectionsHtml = sections.map(sec => `
    <div style="margin-bottom:22px">
      <h2 style="font-family:Georgia,serif;font-size:13px;font-weight:bold;border-bottom:1px solid #ddd;padding-bottom:4px;margin:0 0 8px 0;color:#222;letter-spacing:0.01em">${sec.heading}</h2>
      <p style="font-family:system-ui,sans-serif;font-size:13px;line-height:1.7;color:#333;margin:0">${sec.content.replace(/\n/g, '<br>')}</p>
    </div>`).join('')
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#fff"><div style="max-width:680px;margin:0 auto;padding:48px 56px 56px;box-sizing:border-box;font-family:system-ui,sans-serif">
    <h1 style="font-family:Georgia,serif;font-size:26px;font-weight:bold;margin:0 0 5px 0;color:#111;letter-spacing:-0.02em">${contact.name}</h1>
    <p style="font-size:11px;color:#777;margin:0 0 30px 0;letter-spacing:0.01em">${contactLine}</p>
    ${sectionsHtml}
  </div></body></html>`
}

const pdfStyles = StyleSheet.create({
  page: { flexDirection: 'column', backgroundColor: '#FFFFFF', padding: 40, fontFamily: 'Helvetica' },
  name: { fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  contact: { fontSize: 9, color: '#555', marginBottom: 16 },
  h2: { fontSize: 12, fontWeight: 'bold', borderBottomWidth: 1, borderBottomColor: '#ccc', paddingBottom: 2, marginTop: 14, marginBottom: 6 },
  body: { fontSize: 10, lineHeight: 1.5, color: '#222', marginBottom: 8 },
})

type EducationEntry = { school: string; degree: string; field: string; year: string }
type CoverLetterConfig = { include: boolean; tone: 'professional' | 'warm' | 'direct'; notes?: string }

const ResumePDF = ({ contact, sections }: { contact: Contact; sections: Array<{ heading: string; content: string }> }) => (
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

    const prompt = `Assemble a tailored resume from the provided modules for the role: ${jd.extracted_role_type} at ${jd.extracted_company}.

Rules:
- Paragraph form only — no bullet points anywhere in the body
- No em dashes — use commas or restructure
- Conversational but professional tone
- Lead with what's useful to the reader
- Mirror these exact JD phrases naturally: ${(jd.extracted_phrases || []).join(', ')}

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

Modules:
${JSON.stringify(sortedModules.map((m: Record<string, unknown>) => ({ title: m.title, content: m.content, source_company: m.source_company, source_role_title: m.source_role_title, date_start: m.date_start, date_end: m.date_end })))}`

    const rawResponseText = await aiComplete([{ role: 'user', content: prompt }], 4096)

    const stripped = rawResponseText.replace(/```json/g, '').replace(/```/g, '')
    const jsonStart = stripped.indexOf('{')
    const jsonEnd = stripped.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error(`Model did not return JSON. Response: ${stripped.slice(0, 200)}`)
    }
    const cleanJson = stripped.slice(jsonStart, jsonEnd + 1)
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/,(\s*[}\]])/g, '$1')
    const resumeData: { sections: Array<{ heading: string; content: string }> } = JSON.parse(cleanJson)

    const contactLine = [contact.email, contact.phone, contact.location, contact.linkedin].filter(Boolean).join(' · ')
    const roleTitle = jd.extracted_role_type ?? 'Resume'
    const resumeTitle = `${roleTitle} - ${contact.name}`
    const docxFilename = `${resumeTitle}.docx`

    // Filter sections based on flags
    const sections = resumeData.sections.filter(s => {
      if (!include_summary && s.heading.toLowerCase().includes('summary')) return false
      if (!include_skills_section && s.heading.toLowerCase().includes('skill')) return false
      if (!include_education_section && s.heading.toLowerCase().includes('education')) return false
      return true
    })

    // Build HTML preview
    const resumeHtml = buildResumeHtml(contact, sections)

    // Build DOCX
    const doc = new docx.Document({
      creator: contact.name,
      sections: [
        {
          children: [
            new docx.Paragraph({
              children: [new docx.TextRun({ text: contact.name, bold: true, size: 36 })],
              spacing: { after: 80 },
            }),
            new docx.Paragraph({
              children: [new docx.TextRun({ text: contactLine, size: 18, color: '666666' })],
              spacing: { after: 240 },
            }),
            ...sections.flatMap(sec => [
              new docx.Paragraph({
                text: sec.heading,
                heading: docx.HeadingLevel.HEADING_2,
                spacing: { before: 240, after: 80 },
                border: { bottom: { color: 'cccccc', size: 4, style: docx.BorderStyle.SINGLE, space: 4 } },
              }),
              new docx.Paragraph({
                children: [new docx.TextRun({ text: sec.content, size: 20 })],
                spacing: { after: 120 },
              }),
            ]),
          ],
        },
      ],
    })
    const docxBuffer = await docx.Packer.toBuffer(doc)

    // Build PDF
    const pdfBuffer = await renderToBuffer(
      <ResumePDF contact={contact} sections={sections} />
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

    // Optional cover letter
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
