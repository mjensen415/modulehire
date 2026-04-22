import { NextResponse } from 'next/server'
import { aiComplete } from '@/lib/ai'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAnonClient } from '@supabase/supabase-js'
import * as docx from 'docx'
import { renderToBuffer, Document as PdfDoc, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import React from 'react'

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
    let supabase = await createClient()
    let { data: { user } } = await supabase.auth.getUser()

    // Fallback: accept a real user JWT in the Authorization header (for scripts/API callers)
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
        if (user) supabase = authedClient as any
      }
    }

    if (!user) {
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

    const rawResponseText = await aiComplete([{ role: 'user', content: prompt }], 4096);

    const stripped = rawResponseText.replace(/```json/g, '').replace(/```/g, '');
    const jsonStart = stripped.indexOf('{');
    const jsonEnd = stripped.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error(`Model did not return JSON. Response: ${stripped.slice(0, 200)}`);
    }
    const cleanJson = stripped.slice(jsonStart, jsonEnd + 1)
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/,(\s*[}\]])/g, '$1')
    const resumeData = JSON.parse(cleanJson);

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
    const resumeId = crypto.randomUUID()

    // Upload both files to temp bucket regardless of plan for now
    // Pro differentiation (permanent storage) comes in Phase 2
    const docxPath = `${user.id}/${resumeId}.docx`
    const pdfPath  = `${user.id}/${resumeId}.pdf`

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
        title: resumeData.title,
        module_ids_used: module_ids,
        positioning_variant: positioning_variant,
        docx_url: docxPath,
        pdf_url: pdfPath,
        is_temp: true,
        expires_at: expiresAt,
      })
      .select()
      .single()
    if (saveError) throw saveError

    // Return signed URLs (valid 1 hour) so the client can download immediately
    const { data: docxSigned } = await supabase.storage
      .from('temp')
      .createSignedUrl(docxPath, 3600)
    const { data: pdfSigned } = await supabase.storage
      .from('temp')
      .createSignedUrl(pdfPath, 3600)

    return NextResponse.json({
      resume_id: savedResume.id,
      docx_url: docxSigned?.signedUrl,
      pdf_url:  pdfSigned?.signedUrl,
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
