import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import * as docx from 'docx'
import { renderToBuffer, Document as PdfDoc, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import React from 'react'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const styles = StyleSheet.create({
  page: { flexDirection: 'column', backgroundColor: '#FFFFFF', padding: 30 },
  section: { margin: 10, padding: 10, flexGrow: 1 }
});

const ResumePDF = ({ title, sections }: { title: string, sections: Record<string, string>[] }) => (
  <PdfDoc>
    <Page size="A4" style={styles.page}>
      <View style={styles.section}>
        <Text>{title}</Text>
        {sections.map((sec: Record<string, string>, idx: number) => (
          <Text key={idx} style={{ marginTop: 10 }}>{sec.content}</Text>
        ))}
      </View>
    </Page>
  </PdfDoc>
);

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { module_ids, jd_id, positioning_variant, user_name } = await req.json()

    // Fetch JD
    const { data: jd, error: jdError } = await supabase
      .from('job_descriptions')
      .select('*')
      .eq('id', jd_id)
      .single()
    if (jdError) throw jdError

    // Fetch modules
    const { data: modules, error: modError } = await supabase
      .from('modules')
      .select('*')
      .in('id', module_ids)
    if (modError) throw modError

    // Sort modules by the order requested
    const sortedModules = module_ids.map((id: string) => modules.find(m => m.id === id)).filter(Boolean)

    const prompt = `Assemble a tailored resume from the provided modules.
Rules:
- Paragraph form only — no bullet points anywhere in the body
- No em dashes — use commas or restructure
- Conversational but professional tone
- Lead with what's useful to the reader
- Mirror these exact JD phrases naturally: ${(jd.extracted_phrases || []).join(', ')}
- Opening paragraph: use positioning variant ${positioning_variant} framing
- Structure: Name/contact header, opening summary, experience sections
  (grouped by source_company with role_title and dates), skills section,
  education if present
- Brevity over completeness — if it doesn't add value, cut it

Respond with JSON:
{
  "title": "Generated Resume mapped to JD",
  "sections": [
    { "heading": "Summary", "content": "..." },
    { "heading": "Experience 1", "content": "..." }
  ]
}

Modules:
${JSON.stringify(sortedModules)}`

    const msg = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }]
    });

    const responseText = ((msg.content[0] as unknown) as { text: string }).text.replace(/```json/g, '').replace(/```/g, '').trim();
    const resumeData = JSON.parse(responseText);

    // 1. Generate DOCX
    const doc = new docx.Document({
      creator: user_name,
      sections: [
        {
          children: [
            new docx.Paragraph({ text: resumeData.title, heading: docx.HeadingLevel.HEADING_1 }),
            ...resumeData.sections.flatMap((sec: Record<string, string>) => [
              new docx.Paragraph({ text: sec.heading, heading: docx.HeadingLevel.HEADING_2 }),
              new docx.Paragraph({ text: sec.content }),
            ])
          ],
        },
      ],
    });
    const docxBuffer = await docx.Packer.toBuffer(doc);

    // 2. Generate PDF
    // eslint-disable-next-line react-hooks/error-boundaries
    const pdfBuffer = await renderToBuffer(<ResumePDF title={resumeData.title} sections={resumeData.sections} />);

    // 3. Store config
    // Let's assume free tier stores blobs, pro tier uploads. We'll check the user plan.
    const { data: dbUser } = await supabase.from('users').select('plan').eq('id', user.id).single()
    const isPro = dbUser?.plan === 'pro'

    const resumeId = crypto.randomUUID()
    let docx_url = null
    let pdf_url = null
    let docx_blob = null
    let pdf_blob = null

    if (isPro) {
      await supabase.storage.from('generated').upload(`${user.id}/${resumeId}/resume.docx`, docxBuffer, { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      await supabase.storage.from('generated').upload(`${user.id}/${resumeId}/resume.pdf`, pdfBuffer, { contentType: 'application/pdf' });
      docx_url = `${user.id}/${resumeId}/resume.docx`
      pdf_url = `${user.id}/${resumeId}/resume.pdf`
    } else {
      // Store in DB directly as bytea. Buffer to hex or base64? 
      // Supabase expects hex format for bytea, or base64. Postgres uses \x...
      docx_blob = '\\x' + docxBuffer.toString('hex')
      pdf_blob = '\\x' + pdfBuffer.toString('hex')
    }

    const { data: savedResume, error: saveError } = await supabase.from('generated_resumes').insert({
      id: resumeId,
      user_id: user.id,
      job_description_id: jd_id,
      title: resumeData.title,
      module_ids_used: module_ids,
      positioning_variant: positioning_variant,
      docx_url,
      pdf_url,
      docx_blob,
      pdf_blob
    }).select().single()

    if (saveError) throw saveError

    return NextResponse.json({ resume_id: savedResume.id, docx_url: savedResume.docx_url, pdf_url: savedResume.pdf_url })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
