import { NextResponse } from 'next/server'
import { aiComplete } from '@/lib/ai'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAnonClient } from '@supabase/supabase-js'
import { checkAndLog } from '@/lib/rate-limit'
import { isUuid } from '@/lib/validate'
import { canGenerate } from '@/lib/plan'
import * as docx from 'docx'
import { renderToBuffer, Document as PdfDoc, Page, Text, View } from '@react-pdf/renderer'
import React from 'react'

export const maxDuration = 60

type Contact = { name: string; email: string; phone?: string; linkedin?: string; location?: string }
type ResumeFormat = 'classic' | 'tech' | 'combination' | 'executive' | 'minimal' | 'two-column'
type StructuredData = {
  job_title?: string
  summary?: string
  experience?: { title: string; company: string; dates: string; bullets: string[] }[]
  skills?: string
  education?: string
  awards?: string
}

// ─── COMBINATION TEMPLATE TYPES ───────────────────────────────────────────────
type CombinationData = {
  job_title: string
  summary: string
  skill_sections: { category: string; bullets: string[] }[]
  work_experience: { title: string; company: string; dates: string; bullets: string[] }[]
  education: { degree: string; school: string; year: string }[]
  skills_list: string[]
  awards?: string
}

// ─── HTML PREVIEW ─────────────────────────────────────────────────────────────

function buildResumeHtml(contact: Contact, data: StructuredData, format: ResumeFormat): string {
  const contactLine = [contact.email, contact.phone, contact.location, contact.linkedin].filter(Boolean).join(' · ')

  const renderJobs = (jobs: NonNullable<StructuredData['experience']>, fonts: { body: string; size: string }) =>
    jobs.map(job => `
      <div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <span style="font-family:${fonts.body};font-size:${fonts.size};font-weight:700;color:#222">${job.title} · ${job.company}</span>
          <span style="font-family:${fonts.body};font-size:${fonts.size};color:#888;font-style:italic;white-space:nowrap;margin-left:8px">${job.dates}</span>
        </div>
        <ul style="margin:4px 0 0 0;padding-left:18px">${job.bullets.map(b => `<li style="font-family:${fonts.body};font-size:${fonts.size};line-height:1.6;color:#333;margin-bottom:1px">${b}</li>`).join('')}</ul>
      </div>`).join('')

  // ── Classic ──
  if (format === 'classic') {
    const f = "'Times New Roman',Georgia,serif", sz = '12.5px'
    const h2 = `font-family:${f};font-size:12px;font-weight:700;font-variant:small-caps;letter-spacing:0.07em;text-transform:uppercase;border-bottom:1.5px solid #222;padding-bottom:3px;margin:0 0 8px 0;color:#111`
    const p = `font-family:${f};font-size:${sz};line-height:1.65;color:#333;margin:0`
    const sections = [
      data.summary ? `<div style="margin-bottom:20px"><h2 style="${h2}">Summary</h2><p style="${p}">${data.summary}</p></div>` : '',
      data.experience?.length ? `<div style="margin-bottom:20px"><h2 style="${h2}">Work Experience</h2>${renderJobs(data.experience, { body: f, size: sz })}</div>` : '',
      data.skills ? `<div style="margin-bottom:20px"><h2 style="${h2}">Skills</h2><p style="${p}">${data.skills}</p></div>` : '',
      data.education ? `<div style="margin-bottom:20px"><h2 style="${h2}">Education</h2><p style="${p}">${data.education}</p></div>` : '',
      data.awards ? `<div style="margin-bottom:20px"><h2 style="${h2}">Awards &amp; Certifications</h2><p style="${p}">${data.awards}</p></div>` : '',
    ].filter(Boolean).join('')
    return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#fff"><div style="max-width:680px;margin:0 auto;padding:44px 52px 52px;box-sizing:border-box">
      <div style="text-align:center;padding-bottom:16px;border-bottom:2px solid #111;margin-bottom:20px">
        <h1 style="font-family:${f};font-size:26px;font-weight:700;margin:0 0 3px 0;color:#111;letter-spacing:0.02em;text-transform:uppercase">${contact.name}</h1>
        ${data.job_title ? `<p style="font-family:${f};font-size:12px;color:#666;margin:0 0 4px 0;font-style:italic">${data.job_title}</p>` : ''}
        <p style="font-family:${f};font-size:10.5px;color:#555;margin:0;letter-spacing:0.03em">${contactLine}</p>
      </div>
      ${sections}
    </div></body></html>`
  }

  // ── Tech ──
  // Clean, ATS-optimised: Calibri body, Courier New for contact/dates,
  // blue `#` prefix on section headers, standard heading names, no graphics.
  if (format === 'tech') {
    const f = 'Calibri,Candara,Arial,sans-serif'
    const mono = "'Courier New',Courier,monospace"
    const sz = '12px'
    const BLUE = '#1F6FEB'
    const sectionHead = (label: string) =>
      `<div style="display:flex;align-items:center;gap:5px;margin:20px 0 8px 0;border-bottom:1px solid #e0e0e0;padding-bottom:4px">` +
      `<span style="font-family:${mono};font-weight:700;color:${BLUE};font-size:12px;line-height:1">#</span>` +
      `<span style="font-family:${f};font-size:11px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:#111">${label}</span>` +
      `</div>`
    const renderTechJobs = (jobs: NonNullable<StructuredData['experience']>) =>
      jobs.map(job => `
        <div style="margin-bottom:13px">
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <span style="font-family:${f};font-size:12.5px;font-weight:700;color:#111">${job.title} · ${job.company}</span>
            <span style="font-family:${mono};font-size:10px;color:#555;white-space:nowrap;margin-left:8px">${job.dates}</span>
          </div>
          <ul style="margin:4px 0 0 0;padding-left:18px">${job.bullets.map(b => `<li style="font-family:${f};font-size:${sz};line-height:1.6;color:#333;margin-bottom:2px">${b}</li>`).join('')}</ul>
        </div>`).join('')
    const contactItems = [contact.email, contact.phone, contact.linkedin, contact.location].filter(Boolean).join('  ·  ')
    const sections = [
      data.summary ? `${sectionHead('Summary')}<p style="font-family:${f};font-size:${sz};line-height:1.65;color:#333;margin:0 0 0 0">${data.summary}</p>` : '',
      data.experience?.length ? `${sectionHead('Work Experience')}${renderTechJobs(data.experience)}` : '',
      data.skills ? `${sectionHead('Skills')}<p style="font-family:${f};font-size:${sz};line-height:1.65;color:#333;margin:0">${data.skills}</p>` : '',
      data.education ? `${sectionHead('Education')}<p style="font-family:${f};font-size:${sz};line-height:1.65;color:#333;margin:0">${data.education}</p>` : '',
      data.awards ? `${sectionHead('Awards &amp; Certifications')}<p style="font-family:${f};font-size:${sz};line-height:1.65;color:#333;margin:0">${data.awards}</p>` : '',
    ].filter(Boolean).join('')
    return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#fff"><div style="max-width:680px;margin:0 auto;padding:40px 48px 48px;box-sizing:border-box">
      <h1 style="font-family:${f};font-size:26px;font-weight:700;margin:0 0 3px 0;color:#111">${contact.name}</h1>
      ${data.job_title ? `<p style="font-family:${mono};font-size:11px;color:#1d9e75;margin:0 0 3px 0">${data.job_title}</p>` : ''}
      <p style="font-family:${mono};font-size:10.5px;color:#555;margin:0 0 16px 0">${contactItems}</p>
      <div style="height:1px;background:#e0e0e0;margin-bottom:4px"></div>
      ${sections}
    </div></body></html>`
  }

  // ── Executive ──
  if (format === 'executive') {
    const f = "'Calibri','Candara',Arial,sans-serif", sz = '12px'
    const sectionHead = (label: string) =>
      `<div style="display:flex;align-items:center;gap:8px;margin:18px 0 8px 0">` +
      `<div style="width:20px;height:1px;background:#1e293b;flex-shrink:0"></div>` +
      `<span style="font-family:${f};font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#1e293b;white-space:nowrap">${label}</span>` +
      `<div style="flex:1;height:1px;background:#e5e7eb"></div></div>`
    const sections = [
      data.summary ? `${sectionHead('Summary')}<p style="font-family:${f};font-size:${sz};line-height:1.65;color:#333;margin:0">${data.summary}</p>` : '',
      data.experience?.length ? `${sectionHead('Experience')}${renderJobs(data.experience, { body: f, size: sz })}` : '',
      data.skills ? `${sectionHead('Skills')}<p style="font-family:${f};font-size:${sz};line-height:1.65;color:#333;margin:0">${data.skills}</p>` : '',
      data.education ? `${sectionHead('Education')}<p style="font-family:${f};font-size:${sz};line-height:1.65;color:#333;margin:0">${data.education}</p>` : '',
      data.awards ? `${sectionHead('Awards &amp; Certifications')}<p style="font-family:${f};font-size:${sz};line-height:1.65;color:#333;margin:0">${data.awards}</p>` : '',
    ].filter(Boolean).join('')
    return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#fff"><div style="max-width:680px;margin:0 auto;padding:0 0 48px;box-sizing:border-box">
    <div style="background:#1e293b;padding:28px 48px 22px">
      <h1 style="font-family:${f};font-size:28px;font-weight:700;margin:0 0 4px 0;color:#fff;letter-spacing:0.01em">${contact.name}</h1>
      ${data.job_title ? `<p style="font-family:${f};font-size:13px;color:#94a3b8;margin:0 0 6px 0">${data.job_title}</p>` : ''}
      <p style="font-family:${f};font-size:10.5px;color:#64748b;margin:0">${contactLine}</p>
    </div>
    <div style="padding:8px 48px 0">${sections}</div>
  </div></body></html>`
  }

  // ── Minimal ──
  if (format === 'minimal') {
    const f = "'Helvetica Neue',Helvetica,Arial,sans-serif", sz = '12px'
    const sectionHead = (label: string) =>
      `<div style="font-family:${f};font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#aaa;margin:22px 0 6px 0;padding-bottom:4px;border-bottom:0.5px solid #f0f0f0">${label}</div>`
    const renderMinimalJobs = (jobs: NonNullable<StructuredData['experience']>) =>
      jobs.map(job => `
      <div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <span style="font-family:${f};font-size:12.5px;font-weight:500;color:#111">${job.company}</span>
          <span style="font-family:${f};font-size:10px;color:#aaa;white-space:nowrap;margin-left:8px">${job.dates}</span>
        </div>
        <div style="font-family:${f};font-size:11px;color:#666;margin-bottom:4px">${job.title}</div>
        <ul style="margin:4px 0 0 0;padding-left:16px">${job.bullets.map(b => `<li style="font-family:${f};font-size:${sz};line-height:1.65;color:#444;margin-bottom:1px">${b}</li>`).join('')}</ul>
      </div>`).join('')
    const sections = [
      data.summary ? `${sectionHead('Summary')}<p style="font-family:${f};font-size:${sz};line-height:1.65;color:#444;margin:0">${data.summary}</p>` : '',
      data.experience?.length ? `${sectionHead('Experience')}${renderMinimalJobs(data.experience)}` : '',
      data.skills ? `${sectionHead('Skills')}<p style="font-family:${f};font-size:${sz};line-height:1.65;color:#444;margin:0">${data.skills}</p>` : '',
      data.education ? `${sectionHead('Education')}<p style="font-family:${f};font-size:${sz};line-height:1.65;color:#444;margin:0">${data.education}</p>` : '',
      data.awards ? `${sectionHead('Awards &amp; Certifications')}<p style="font-family:${f};font-size:${sz};line-height:1.65;color:#444;margin:0">${data.awards}</p>` : '',
    ].filter(Boolean).join('')
    return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#fff"><div style="max-width:680px;margin:0 auto;padding:48px 52px 52px;box-sizing:border-box">
    <h1 style="font-family:${f};font-size:26px;font-weight:400;margin:0 0 4px 0;color:#111;letter-spacing:-0.02em">${contact.name}</h1>
    ${data.job_title ? `<p style="font-family:${f};font-size:12px;color:#888;margin:0 0 4px 0;letter-spacing:0.01em">${data.job_title}</p>` : ''}
    <p style="font-family:${f};font-size:10.5px;color:#aaa;margin:0 0 16px 0">${contactLine}</p>
    <div style="height:0.5px;background:#e5e7eb;margin-bottom:4px"></div>
    ${sections}
  </div></body></html>`
  }

  // ── Fallthrough: should not be reached with valid format values ──
  return ''
}

// ─── DOCX BUILDERS ────────────────────────────────────────────────────────────

function buildDocx(contact: Contact, data: StructuredData, format: ResumeFormat, contactLine: string): docx.Document {
  const twip = (inches: number) => Math.round(inches * 1440)
  const bulletRef = 'body-bullets'
  const bulletConfig = [{ reference: bulletRef, levels: [{ level: 0, format: docx.LevelFormat.BULLET, text: '\u2022', alignment: docx.AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 220 } } } }] }]
  const bul = (text: string, size: number, font: string) => new docx.Paragraph({
    numbering: { reference: bulletRef, level: 0 },
    spacing: { before: 40, after: 40, line: 276 },
    children: [new docx.TextRun({ text, size, font })],
  })

  // ── Classic ──────────────────────────────────────────────────────────────────
  if (format === 'classic') {
    const font = 'Times New Roman'
    const sectionHead = (text: string) => new docx.Paragraph({
      alignment: docx.AlignmentType.LEFT,
      children: [new docx.TextRun({ text: text.toUpperCase(), bold: true, size: 22, font, smallCaps: true })],
      spacing: { before: 280, after: 80, line: 276 },
      border: { bottom: { color: '111111', size: 6, style: docx.BorderStyle.SINGLE, space: 3 } },
    })
    const children = [
      new docx.Paragraph({
        alignment: docx.AlignmentType.CENTER,
        children: [new docx.TextRun({ text: contact.name.toUpperCase(), bold: true, size: 36, font })],
        spacing: { after: 60 },
      }),
      new docx.Paragraph({
        alignment: docx.AlignmentType.CENTER,
        children: [new docx.TextRun({ text: contactLine, size: 18, color: '555555', font })],
        spacing: { after: 0 },
        border: { bottom: { color: '111111', size: 12, style: docx.BorderStyle.SINGLE, space: 6 } },
      }),
      new docx.Paragraph({ children: [], spacing: { after: 160 } }),
      ...(data.summary ? [sectionHead('Summary'), new docx.Paragraph({ children: [new docx.TextRun({ text: data.summary, size: 22, font })], spacing: { after: 120, line: 276 } })] : []),
      ...(data.experience?.length ? [
        sectionHead('Work Experience'),
        ...data.experience.flatMap(job => [
          new docx.Paragraph({
            spacing: { before: 140, after: 40, line: 276 },
            tabStops: [{ type: docx.TabStopType.RIGHT, position: docx.TabStopPosition.MAX }],
            children: [
              new docx.TextRun({ text: `${job.company}`, bold: true, size: 22, font }),
              new docx.TextRun({ text: '\t' + job.dates, size: 20, font, color: '777777', italics: true }),
            ],
          }),
          new docx.Paragraph({ children: [new docx.TextRun({ text: job.title, size: 21, font, italics: true })], spacing: { after: 40 } }),
          ...job.bullets.map(b => bul(b, 22, font)),
        ]),
      ] : []),
      ...(data.skills ? [sectionHead('Skills'), new docx.Paragraph({ children: [new docx.TextRun({ text: data.skills, size: 22, font })], spacing: { after: 120, line: 276 } })] : []),
      ...(data.education ? [sectionHead('Education'), new docx.Paragraph({ children: [new docx.TextRun({ text: data.education, size: 22, font })], spacing: { after: 120, line: 276 } })] : []),
      ...(data.awards ? [sectionHead('Awards & Certifications'), new docx.Paragraph({ children: [new docx.TextRun({ text: data.awards, size: 22, font })], spacing: { after: 120, line: 276 } })] : []),
    ]
    return new docx.Document({ creator: contact.name, numbering: { config: bulletConfig }, sections: [{ properties: { page: { margin: { top: twip(1), right: twip(1), bottom: twip(1), left: twip(1) } } }, children }] })
  }

  // ── Tech ──────────────────────────────────────────────────────────────────────
  // Calibri body, Courier New for contact/dates, blue "#" prefix on section heads.
  // ATS-safe: no tables, no text boxes, standard section names.
  const font = 'Calibri'
  const BLUE = '1F6FEB'
  const sectionHead = (text: string) => new docx.Paragraph({
    spacing: { before: 280, after: 80 },
    border: { bottom: { color: 'E0E0E0', size: 4, style: docx.BorderStyle.SINGLE, space: 3 } },
    children: [
      new docx.TextRun({ text: '# ', bold: true, size: 20, font: 'Courier New', color: BLUE }),
      new docx.TextRun({ text: text.toUpperCase(), bold: true, size: 20, font, color: '111111', allCaps: true }),
    ],
  })
  const children = [
    new docx.Paragraph({ children: [new docx.TextRun({ text: contact.name, bold: true, size: 40, font })], spacing: { after: 60 } }),
    new docx.Paragraph({
      children: [new docx.TextRun({ text: [contact.email, contact.phone, contact.linkedin, contact.location].filter(Boolean).join('  ·  '), size: 18, color: '555555', font: 'Courier New' })],
      spacing: { after: 0 },
      border: { bottom: { color: 'E0E0E0', size: 4, style: docx.BorderStyle.SINGLE, space: 6 } },
    }),
    new docx.Paragraph({ children: [], spacing: { after: 120 } }),
    ...(data.summary ? [sectionHead('Summary'), new docx.Paragraph({ children: [new docx.TextRun({ text: data.summary, size: 21, font })], spacing: { after: 120, line: 276 } })] : []),
    ...(data.experience?.length ? [
      sectionHead('Work Experience'),
      ...data.experience.flatMap(job => [
        new docx.Paragraph({
          spacing: { before: 140, after: 30, line: 276 },
          tabStops: [{ type: docx.TabStopType.RIGHT, position: docx.TabStopPosition.MAX }],
          children: [
            new docx.TextRun({ text: `${job.title} · ${job.company}`, bold: true, size: 22, font }),
            new docx.TextRun({ text: '\t' + job.dates, size: 18, font: 'Courier New', color: '555555' }),
          ],
        }),
        ...job.bullets.map(b => bul(b, 21, font)),
      ]),
    ] : []),
    ...(data.skills ? [sectionHead('Skills'), new docx.Paragraph({ children: [new docx.TextRun({ text: data.skills, size: 21, font })], spacing: { after: 100, line: 276 } })] : []),
    ...(data.education ? [sectionHead('Education'), new docx.Paragraph({ children: [new docx.TextRun({ text: data.education, size: 21, font })], spacing: { after: 100, line: 276 } })] : []),
    ...(data.awards ? [sectionHead('Awards & Certifications'), new docx.Paragraph({ children: [new docx.TextRun({ text: data.awards, size: 21, font })], spacing: { after: 100, line: 276 } })] : []),
  ]
  return new docx.Document({ creator: contact.name, numbering: { config: bulletConfig }, sections: [{ properties: { page: { margin: { top: twip(0.85), right: twip(0.85), bottom: twip(0.85), left: twip(0.85) } } }, children }] })
}

function buildDocxExecutiveOrMinimal(contact: Contact, data: StructuredData, format: 'executive' | 'minimal', contactLine: string): docx.Document {
  const twip = (inches: number) => Math.round(inches * 1440)
  const bulletRef = 'body-bullets'
  const bulletConfig = [{ reference: bulletRef, levels: [{ level: 0, format: docx.LevelFormat.BULLET, text: '•', alignment: docx.AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 220 } } } }] }]
  const bul = (text: string, size: number, font: string) => new docx.Paragraph({
    numbering: { reference: bulletRef, level: 0 },
    spacing: { before: 40, after: 40, line: 276 },
    children: [new docx.TextRun({ text, size, font })],
  })

  if (format === 'executive') {
    const font = 'Calibri'
    const sectionHead = (text: string) => new docx.Paragraph({
      children: [
        new docx.TextRun({ text: '— ', size: 20, font, color: '1e293b' }),
        new docx.TextRun({ text: text.toUpperCase(), bold: true, size: 20, font, color: '1e293b', characterSpacing: 80 }),
      ],
      spacing: { before: 240, after: 80, line: 276 },
      border: { bottom: { color: 'e5e7eb', size: 4, style: docx.BorderStyle.SINGLE, space: 3 } },
    })
    const children = [
      new docx.Paragraph({
        shading: { type: docx.ShadingType.CLEAR, fill: '1e293b', color: '1e293b' },
        spacing: { before: 0, after: 60 },
        children: [new docx.TextRun({ text: contact.name, bold: true, size: 44, font, color: 'FFFFFF' })],
      }),
      ...(data.job_title ? [new docx.Paragraph({
        shading: { type: docx.ShadingType.CLEAR, fill: '1e293b', color: '1e293b' },
        spacing: { before: 0, after: 60 },
        children: [new docx.TextRun({ text: data.job_title, size: 22, font, color: '94a3b8' })],
      })] : []),
      new docx.Paragraph({
        shading: { type: docx.ShadingType.CLEAR, fill: '1e293b', color: '1e293b' },
        spacing: { before: 0, after: 240 },
        children: [new docx.TextRun({ text: contactLine, size: 18, font, color: '64748b' })],
      }),
      ...(data.summary ? [sectionHead('Summary'), new docx.Paragraph({ children: [new docx.TextRun({ text: data.summary, size: 22, font })], spacing: { after: 120, line: 276 } })] : []),
      ...(data.experience?.length ? [
        sectionHead('Experience'),
        ...data.experience.flatMap(job => [
          new docx.Paragraph({
            tabStops: [{ type: docx.TabStopType.RIGHT, position: docx.TabStopPosition.MAX }],
            spacing: { before: 140, after: 40 },
            children: [
              new docx.TextRun({ text: `${job.title} · ${job.company}`, bold: true, size: 22, font }),
              new docx.TextRun({ text: `\t${job.dates}`, size: 18, font, color: '888888', italics: true }),
            ],
          }),
          ...job.bullets.map(b => bul(b, 22, font)),
        ]),
      ] : []),
      ...(data.skills ? [sectionHead('Skills'), new docx.Paragraph({ children: [new docx.TextRun({ text: data.skills, size: 22, font })], spacing: { after: 120, line: 276 } })] : []),
      ...(data.education ? [sectionHead('Education'), new docx.Paragraph({ children: [new docx.TextRun({ text: data.education, size: 22, font })], spacing: { after: 120, line: 276 } })] : []),
      ...(data.awards ? [sectionHead('Awards & Certifications'), new docx.Paragraph({ children: [new docx.TextRun({ text: data.awards, size: 22, font })], spacing: { after: 120, line: 276 } })] : []),
    ]
    return new docx.Document({ creator: contact.name, numbering: { config: bulletConfig }, sections: [{ properties: { page: { margin: { top: twip(0), right: twip(0.85), bottom: twip(0.85), left: twip(0.85) } } }, children }] })
  }

  // minimal
  const font = 'Calibri'
  const sectionHead = (text: string) => new docx.Paragraph({
    children: [new docx.TextRun({ text: text.toUpperCase(), size: 16, font, color: 'aaaaaa', characterSpacing: 100 })],
    spacing: { before: 280, after: 60, line: 276 },
    border: { bottom: { color: 'f0f0f0', size: 4, style: docx.BorderStyle.SINGLE, space: 3 } },
  })
  const children = [
    new docx.Paragraph({
      spacing: { after: 60 },
      children: [new docx.TextRun({ text: contact.name, size: 44, font, color: '111111' })],
    }),
    ...(data.job_title ? [new docx.Paragraph({
      spacing: { after: 40 },
      children: [new docx.TextRun({ text: data.job_title, size: 20, font, color: '888888' })],
    })] : []),
    new docx.Paragraph({
      spacing: { after: 0 },
      border: { bottom: { color: 'e5e7eb', size: 4, style: docx.BorderStyle.SINGLE, space: 6 } },
      children: [new docx.TextRun({ text: contactLine, size: 18, font, color: 'aaaaaa' })],
    }),
    new docx.Paragraph({ children: [], spacing: { after: 100 } }),
    ...(data.summary ? [sectionHead('Summary'), new docx.Paragraph({ children: [new docx.TextRun({ text: data.summary, size: 22, font, color: '444444' })], spacing: { after: 120, line: 276 } })] : []),
    ...(data.experience?.length ? [
      sectionHead('Experience'),
      ...data.experience.flatMap(job => [
        new docx.Paragraph({
          tabStops: [{ type: docx.TabStopType.RIGHT, position: docx.TabStopPosition.MAX }],
          spacing: { before: 120, after: 20 },
          children: [
            new docx.TextRun({ text: job.company, bold: true, size: 22, font }),
            new docx.TextRun({ text: `\t${job.dates}`, size: 18, font, color: 'aaaaaa' }),
          ],
        }),
        new docx.Paragraph({ spacing: { before: 0, after: 40 }, children: [new docx.TextRun({ text: job.title, size: 20, font, color: '666666', italics: true })] }),
        ...job.bullets.map(b => bul(b, 21, font)),
      ]),
    ] : []),
    ...(data.skills ? [sectionHead('Skills'), new docx.Paragraph({ children: [new docx.TextRun({ text: data.skills, size: 21, font, color: '444444' })], spacing: { after: 100, line: 276 } })] : []),
    ...(data.education ? [sectionHead('Education'), new docx.Paragraph({ children: [new docx.TextRun({ text: data.education, size: 21, font, color: '444444' })], spacing: { after: 100, line: 276 } })] : []),
    ...(data.awards ? [sectionHead('Awards & Certifications'), new docx.Paragraph({ children: [new docx.TextRun({ text: data.awards, size: 21, font, color: '444444' })], spacing: { after: 100, line: 276 } })] : []),
  ]
  return new docx.Document({ creator: contact.name, numbering: { config: bulletConfig }, sections: [{ properties: { page: { margin: { top: twip(1), right: twip(1), bottom: twip(1), left: twip(1) } } }, children }] })
}


// ─── COMBINATION DOCX BUILDER ────────────────────────────────────────────────

function buildDocxCombination(contact: Contact, data: CombinationData): docx.Document {
  const twip = (inches: number) => Math.round(inches * 1440)
  const HEADER_FILL  = 'C49098'
  const SECTION_FILL = 'EDD5D7'
  const CONTACT_FILL = 'F2F2F2'

  // ATS-safe: paragraph shading replaces table-based headers (tables break Workday/Taleo parsers)
  const headerParas = (): docx.Paragraph[] => [
    new docx.Paragraph({
      alignment: docx.AlignmentType.CENTER,
      shading: { type: docx.ShadingType.CLEAR, fill: HEADER_FILL, color: HEADER_FILL },
      spacing: { before: 240, after: 80 },
      children: [new docx.TextRun({ text: contact.name, size: 52, bold: true, color: 'FFFFFF', font: 'Calibri' })],
    }),
    new docx.Paragraph({
      alignment: docx.AlignmentType.CENTER,
      shading: { type: docx.ShadingType.CLEAR, fill: HEADER_FILL, color: HEADER_FILL },
      spacing: { before: 0, after: data.summary ? 0 : 240 },
      children: [new docx.TextRun({ text: data.job_title, size: 22, color: 'F0D8DA', font: 'Calibri' })],
    }),
    ...(data.summary ? [new docx.Paragraph({
      alignment: docx.AlignmentType.CENTER,
      shading: { type: docx.ShadingType.CLEAR, fill: HEADER_FILL, color: HEADER_FILL },
      spacing: { before: 80, after: 240 },
      children: [new docx.TextRun({ text: data.summary, size: 19, color: 'F5E6E8', font: 'Calibri', italics: true })],
    })] : []),
  ]

  const contactPara = () => new docx.Paragraph({
    alignment: docx.AlignmentType.CENTER,
    shading: { type: docx.ShadingType.CLEAR, fill: CONTACT_FILL, color: CONTACT_FILL },
    spacing: { before: 0, after: 0 },
    children: [new docx.TextRun({
      text: [contact.phone, contact.location, contact.linkedin, contact.email].filter(Boolean).join('  |  '),
      size: 18, color: '555555', font: 'Calibri',
    })],
  })

  const sectionHeader = (label: string) => new docx.Paragraph({
    shading: { type: docx.ShadingType.CLEAR, fill: SECTION_FILL, color: SECTION_FILL },
    spacing: { before: 200, after: 80 },
    children: [new docx.TextRun({ text: label, bold: true, size: 22, font: 'Calibri', color: '3D2B2D' })],
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
        ...headerParas(),
        contactPara(),
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
        ...(data.awards ? [
          sectionHeader('AWARDS & CERTIFICATIONS'),
          spacer(80),
          new docx.Paragraph({
            spacing: { before: 100, after: 60 },
            children: [new docx.TextRun({ text: data.awards, size: 20, font: 'Calibri', color: '444444' })],
          }),
        ] : []),
      ]
    }]
  })
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

type EducationEntry = { school: string; degree: string; field: string; year: string }
type CoverLetterConfig = { include: boolean; tone: 'professional' | 'warm' | 'direct'; notes?: string }

// ── Classic PDF: Times-Roman serif, small-caps section headers ──────────────
const ResumePDFClassic = ({ contact, data }: { contact: Contact; data: StructuredData }) => {
  const contactLine = [contact.email, contact.phone, contact.location, contact.linkedin].filter(Boolean).join(' · ')
  const body = { fontSize: 10, fontFamily: 'Times-Roman', lineHeight: 1.5, color: '#333333' }
  const SectionH = ({ title }: { title: string }) => (
    <View style={{ marginTop: 14, marginBottom: 4 }}>
      <Text style={{ fontSize: 10, fontFamily: 'Times-Bold', color: '#111111', textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</Text>
      <View style={{ borderBottomWidth: 0.75, borderBottomColor: '#333333', marginTop: 2 }} />
    </View>
  )
  return (
    <PdfDoc>
      <Page size="LETTER" style={{ fontFamily: 'Times-Roman', paddingTop: 44, paddingRight: 52, paddingBottom: 52, paddingLeft: 52, backgroundColor: '#FFFFFF' }}>
        <Text style={{ fontSize: 20, fontFamily: 'Times-Bold', textAlign: 'center', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{contact.name}</Text>
        <Text style={{ fontSize: 9, color: '#555555', textAlign: 'center', marginBottom: 6 }}>{contactLine}</Text>
        <View style={{ borderBottomWidth: 1.5, borderBottomColor: '#111111', marginBottom: 14 }} />
        {data.summary ? (
          <View style={{ marginBottom: 10 }}>
            <SectionH title="Summary" />
            <Text style={{ ...body, marginTop: 4 }}>{data.summary}</Text>
          </View>
        ) : null}
        {data.experience?.length ? (
          <View style={{ marginBottom: 10 }}>
            <SectionH title="Work Experience" />
            {data.experience.map((job, i) => (
              <View key={i} style={{ marginTop: 8, marginBottom: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 }}>
                  <Text style={{ fontSize: 10, fontFamily: 'Times-Bold', color: '#222222' }}>{job.company}</Text>
                  <Text style={{ fontSize: 9, fontFamily: 'Times-Italic', color: '#777777' }}>{job.dates}</Text>
                </View>
                <Text style={{ fontSize: 9.5, fontFamily: 'Times-Italic', color: '#444444', marginBottom: 3 }}>{job.title}</Text>
                {job.bullets.map((b, j) => (
                  <View key={j} style={{ flexDirection: 'row', marginBottom: 2, paddingLeft: 8 }}>
                    <Text style={{ fontSize: 9.5, fontFamily: 'Times-Roman', color: '#555555', marginRight: 4 }}>•</Text>
                    <Text style={{ fontSize: 9.5, fontFamily: 'Times-Roman', color: '#333333', lineHeight: 1.45, flex: 1 }}>{b}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : null}
        {data.skills ? (
          <View style={{ marginBottom: 10 }}>
            <SectionH title="Skills" />
            <Text style={{ ...body, marginTop: 4 }}>{data.skills}</Text>
          </View>
        ) : null}
        {data.education ? (
          <View style={{ marginBottom: 10 }}>
            <SectionH title="Education" />
            <Text style={{ ...body, marginTop: 4 }}>{data.education}</Text>
          </View>
        ) : null}
        {data.awards ? (
          <View style={{ marginBottom: 10 }}>
            <SectionH title="Awards & Certifications" />
            <Text style={{ ...body, marginTop: 4 }}>{data.awards}</Text>
          </View>
        ) : null}
      </Page>
    </PdfDoc>
  )
}

// ── Tech PDF: Helvetica body, Courier contact/dates, blue "#" section markers ──
const ResumePDFTech = ({ contact, data }: { contact: Contact; data: StructuredData }) => {
  const contactItems = [contact.email, contact.phone, contact.linkedin, contact.location].filter(Boolean).join('  ·  ')
  const BLUE = '#1F6FEB'
  const body = { fontSize: 10, fontFamily: 'Helvetica', lineHeight: 1.5, color: '#333333' }
  const SectionH = ({ title }: { title: string }) => (
    <View style={{ marginTop: 14, marginBottom: 6, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 0.75, borderBottomColor: '#E0E0E0', paddingBottom: 3 }}>
      <Text style={{ fontSize: 11, fontFamily: 'Courier-Bold', color: BLUE, marginRight: 4 }}>#</Text>
      <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#111111', textTransform: 'uppercase', letterSpacing: 0.6 }}>{title}</Text>
    </View>
  )
  return (
    <PdfDoc>
      <Page size="LETTER" style={{ fontFamily: 'Helvetica', paddingTop: 40, paddingRight: 48, paddingBottom: 48, paddingLeft: 48, backgroundColor: '#FFFFFF' }}>
        <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#111111', marginBottom: 3 }}>{contact.name}</Text>
        <Text style={{ fontSize: 9, fontFamily: 'Courier', color: '#555555', marginBottom: 0 }}>{contactItems}</Text>
        <View style={{ borderBottomWidth: 0.75, borderBottomColor: '#E0E0E0', marginTop: 8, marginBottom: 4 }} />
        {data.summary ? (
          <View style={{ marginBottom: 10 }}>
            <SectionH title="Summary" />
            <Text style={body}>{data.summary}</Text>
          </View>
        ) : null}
        {data.experience?.length ? (
          <View style={{ marginBottom: 10 }}>
            <SectionH title="Work Experience" />
            {data.experience.map((job, i) => (
              <View key={i} style={{ marginTop: 8, marginBottom: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 3 }}>
                  <Text style={{ fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: '#111111' }}>{job.title} · {job.company}</Text>
                  <Text style={{ fontSize: 9, fontFamily: 'Courier', color: '#555555' }}>{job.dates}</Text>
                </View>
                {job.bullets.map((b, j) => (
                  <View key={j} style={{ flexDirection: 'row', marginBottom: 2, paddingLeft: 8 }}>
                    <Text style={{ fontSize: 9.5, color: '#555555', marginRight: 4 }}>•</Text>
                    <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica', color: '#333333', lineHeight: 1.45, flex: 1 }}>{b}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : null}
        {data.skills ? (
          <View style={{ marginBottom: 10 }}>
            <SectionH title="Skills" />
            <Text style={body}>{data.skills}</Text>
          </View>
        ) : null}
        {data.education ? (
          <View style={{ marginBottom: 10 }}>
            <SectionH title="Education" />
            <Text style={body}>{data.education}</Text>
          </View>
        ) : null}
        {data.awards ? (
          <View style={{ marginBottom: 10 }}>
            <SectionH title="Awards & Certifications" />
            <Text style={body}>{data.awards}</Text>
          </View>
        ) : null}
      </Page>
    </PdfDoc>
  )
}

// ── Combination PDF: rose/pink theme, skill sections + work experience ───────
const ResumePDFCombination = ({ contact, data }: { contact: Contact; data: CombinationData }) => {
  const contactItems = [contact.phone, contact.location, contact.linkedin, contact.email].filter(Boolean).join('  |  ')
  const HEADER = '#C49098', SECTION = '#EDD5D7', DARK = '#3D2B2D'
  const SectionBanner = ({ title }: { title: string }) => (
    <View style={{ backgroundColor: SECTION, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 8 }}>
      <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: DARK, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</Text>
    </View>
  )
  return (
    <PdfDoc>
      <Page size="LETTER" style={{ fontFamily: 'Helvetica', backgroundColor: '#FFFFFF' }}>
        <View style={{ backgroundColor: HEADER, paddingHorizontal: 48, paddingVertical: 20, alignItems: 'center' }}>
          <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#FFFFFF', marginBottom: 3 }}>{contact.name}</Text>
          <Text style={{ fontSize: 11, color: '#F0D8DA', marginBottom: data.summary ? 8 : 0 }}>{data.job_title}</Text>
          {data.summary ? (
            <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica-Oblique', color: '#F5E6E8', textAlign: 'center', lineHeight: 1.5 }}>{data.summary}</Text>
          ) : null}
        </View>
        <View style={{ backgroundColor: '#F2F2F2', paddingHorizontal: 48, paddingVertical: 6, alignItems: 'center', marginBottom: 14 }}>
          <Text style={{ fontSize: 9, color: '#555555' }}>{contactItems}</Text>
        </View>
        <View style={{ paddingHorizontal: 32, paddingBottom: 32 }}>
          <SectionBanner title="Relevant Skills" />
          {data.skill_sections.map((sec, i) => (
            <View key={i} style={{ marginBottom: 8 }}>
              <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 3 }}>{sec.category}</Text>
              {sec.bullets.map((b, j) => (
                <View key={j} style={{ flexDirection: 'row', marginBottom: 2, paddingLeft: 8 }}>
                  <Text style={{ fontSize: 9.5, color: '#555555', marginRight: 4 }}>•</Text>
                  <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica', color: '#333333', lineHeight: 1.45, flex: 1 }}>{b}</Text>
                </View>
              ))}
            </View>
          ))}
          <View style={{ marginTop: 10 }}>
            <SectionBanner title="Work Experience" />
            {data.work_experience.map((job, i) => (
              <View key={i} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 }}>
                  <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#222222' }}>{job.title}</Text>
                  <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Oblique', color: '#777777' }}>{job.dates}</Text>
                </View>
                <Text style={{ fontSize: 9.5, color: '#666666', marginBottom: 3 }}>{job.company}</Text>
                {job.bullets.map((b, j) => (
                  <View key={j} style={{ flexDirection: 'row', marginBottom: 2, paddingLeft: 8 }}>
                    <Text style={{ fontSize: 9.5, color: '#555555', marginRight: 4 }}>•</Text>
                    <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica', color: '#333333', lineHeight: 1.45, flex: 1 }}>{b}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
          {data.education.length > 0 ? (
            <View style={{ marginTop: 8 }}>
              <SectionBanner title="Education" />
              {data.education.map((e, i) => (
                <Text key={i} style={{ fontSize: 10, fontFamily: 'Helvetica', color: '#333333', marginBottom: 3 }}>{e.degree} · {e.school} · {e.year}</Text>
              ))}
            </View>
          ) : null}
          {data.skills_list.length > 0 ? (
            <View style={{ marginTop: 10 }}>
              <SectionBanner title="Skills" />
              <Text style={{ fontSize: 9.5, color: '#444444', lineHeight: 1.5 }}>{data.skills_list.join('  ·  ')}</Text>
            </View>
          ) : null}
          {data.awards ? (
            <View style={{ marginTop: 10 }}>
              <SectionBanner title="Awards & Certifications" />
              <Text style={{ fontSize: 9.5, color: '#444444', lineHeight: 1.5 }}>{data.awards}</Text>
            </View>
          ) : null}
        </View>
      </Page>
    </PdfDoc>
  )
}

// ── Executive PDF ──────────────────────────────────────────────────────────────
const ResumePDFExecutive = ({ contact, data }: { contact: Contact; data: StructuredData }) => {
  const contactItems = [contact.email, contact.phone, contact.location, contact.linkedin].filter(Boolean).join('  ·  ')
  const body = { fontSize: 9.5, fontFamily: 'Helvetica', color: '#333333', lineHeight: 1.5 }
  const SectionHead = ({ title }: { title: string }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, marginTop: 14 }}>
      <View style={{ width: 16, height: 0.5, backgroundColor: '#1e293b', marginRight: 6 }} />
      <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#1e293b', textTransform: 'uppercase', letterSpacing: 1 }}>{title}</Text>
      <View style={{ flex: 1, height: 0.5, backgroundColor: '#e5e7eb', marginLeft: 6 }} />
    </View>
  )
  return (
    <PdfDoc>
      <Page size="LETTER" style={{ fontFamily: 'Helvetica', backgroundColor: '#FFFFFF' }}>
        <View style={{ backgroundColor: '#1e293b', paddingHorizontal: 48, paddingVertical: 22 }}>
          <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#FFFFFF', marginBottom: 4 }}>{contact.name}</Text>
          {data.job_title ? <Text style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>{data.job_title}</Text> : null}
          <Text style={{ fontSize: 9, color: '#64748b' }}>{contactItems}</Text>
        </View>
        <View style={{ paddingHorizontal: 48, paddingBottom: 32 }}>
          {data.summary ? (
            <View>
              <SectionHead title="Summary" />
              <Text style={body}>{data.summary}</Text>
            </View>
          ) : null}
          {data.experience?.length ? (
            <View>
              <SectionHead title="Experience" />
              {data.experience.map((job, i) => (
                <View key={i} style={{ marginBottom: 9 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 }}>
                    <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#111111', flex: 1 }}>{job.title} · {job.company}</Text>
                    <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Oblique', color: '#888888' }}>{job.dates}</Text>
                  </View>
                  {job.bullets.map((b, j) => (
                    <View key={j} style={{ flexDirection: 'row', marginBottom: 2, paddingLeft: 8 }}>
                      <Text style={{ fontSize: 9.5, color: '#555555', marginRight: 4 }}>•</Text>
                      <Text style={{ ...body, flex: 1 }}>{b}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          ) : null}
          {data.skills ? (
            <View style={{ marginBottom: 10 }}>
              <SectionHead title="Skills" />
              <Text style={body}>{data.skills}</Text>
            </View>
          ) : null}
          {data.education ? (
            <View style={{ marginBottom: 10 }}>
              <SectionHead title="Education" />
              <Text style={body}>{data.education}</Text>
            </View>
          ) : null}
          {data.awards ? (
            <View style={{ marginBottom: 10 }}>
              <SectionHead title="Awards & Certifications" />
              <Text style={body}>{data.awards}</Text>
            </View>
          ) : null}
        </View>
      </Page>
    </PdfDoc>
  )
}

// ── Minimal PDF ─────────────────────────────────────────────────────────────────
const ResumePDFMinimal = ({ contact, data }: { contact: Contact; data: StructuredData }) => {
  const contactItems = [contact.email, contact.phone, contact.location, contact.linkedin].filter(Boolean).join('  ·  ')
  const body = { fontSize: 9.5, fontFamily: 'Helvetica', color: '#444444', lineHeight: 1.6 }
  const SectionHead = ({ title }: { title: string }) => (
    <View style={{ borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0', marginBottom: 5, marginTop: 16, paddingBottom: 3 }}>
      <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#aaaaaa', textTransform: 'uppercase', letterSpacing: 1.5 }}>{title}</Text>
    </View>
  )
  return (
    <PdfDoc>
      <Page size="LETTER" style={{ fontFamily: 'Helvetica', backgroundColor: '#FFFFFF', paddingHorizontal: 48, paddingVertical: 44 }}>
        <Text style={{ fontSize: 22, color: '#111111', marginBottom: 3, letterSpacing: -0.3 }}>{contact.name}</Text>
        {data.job_title ? <Text style={{ fontSize: 11, color: '#888888', marginBottom: 3 }}>{data.job_title}</Text> : null}
        <Text style={{ fontSize: 9, color: '#aaaaaa', marginBottom: 14 }}>{contactItems}</Text>
        <View style={{ borderBottomWidth: 0.5, borderBottomColor: '#e5e7eb', marginBottom: 4 }} />
        {data.summary ? (
          <View>
            <SectionHead title="Summary" />
            <Text style={body}>{data.summary}</Text>
          </View>
        ) : null}
        {data.experience?.length ? (
          <View>
            <SectionHead title="Experience" />
            {data.experience.map((job, i) => (
              <View key={i} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 }}>
                  <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#111111' }}>{job.company}</Text>
                  <Text style={{ fontSize: 9, color: '#aaaaaa' }}>{job.dates}</Text>
                </View>
                <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Oblique', color: '#666666', marginBottom: 3 }}>{job.title}</Text>
                {job.bullets.map((b, j) => (
                  <View key={j} style={{ flexDirection: 'row', marginBottom: 2, paddingLeft: 8 }}>
                    <Text style={{ fontSize: 9.5, color: '#aaaaaa', marginRight: 4 }}>–</Text>
                    <Text style={{ ...body, flex: 1 }}>{b}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : null}
        {data.skills ? (
          <View style={{ marginBottom: 10 }}>
            <SectionHead title="Skills" />
            <Text style={body}>{data.skills}</Text>
          </View>
        ) : null}
        {data.education ? (
          <View style={{ marginBottom: 10 }}>
            <SectionHead title="Education" />
            <Text style={body}>{data.education}</Text>
          </View>
        ) : null}
        {data.awards ? (
          <View style={{ marginBottom: 10 }}>
            <SectionHead title="Awards & Certifications" />
            <Text style={body}>{data.awards}</Text>
          </View>
        ) : null}
      </Page>
    </PdfDoc>
  )
}

// ── Two-column PDF ──────────────────────────────────────────────────────────────
const ResumePDFTwoColumn = ({ contact, data }: { contact: Contact; data: StructuredData }) => {
  const SIDEBAR = '#f8fafc', ACCENT = '#1d9e75'
  const body = { fontSize: 9.5, fontFamily: 'Helvetica', color: '#333333', lineHeight: 1.5 }
  const sideBody = { fontSize: 9, fontFamily: 'Helvetica', color: '#555555', lineHeight: 1.5 }
  const SideHead = ({ title }: { title: string }) => (
    <View style={{ marginBottom: 4, marginTop: 12 }}>
      <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#555555', textTransform: 'uppercase', letterSpacing: 1 }}>{title}</Text>
      <View style={{ height: 0.5, backgroundColor: '#cbd5e1', marginTop: 3 }} />
    </View>
  )
  const MainHead = ({ title }: { title: string }) => (
    <View style={{ marginBottom: 5, marginTop: 12 }}>
      <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#555555', textTransform: 'uppercase', letterSpacing: 1 }}>{title}</Text>
      <View style={{ height: 0.5, backgroundColor: '#e5e7eb', marginTop: 3 }} />
    </View>
  )
  const initials = contact.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('')
  return (
    <PdfDoc>
      <Page size="LETTER" style={{ fontFamily: 'Helvetica', backgroundColor: '#FFFFFF', flexDirection: 'row' }}>
        {/* Sidebar */}
        <View style={{ width: 180, backgroundColor: SIDEBAR, paddingHorizontal: 16, paddingVertical: 28, borderRightWidth: 0.5, borderRightColor: '#e5e7eb' }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: ACCENT + '30', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
            <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: ACCENT }}>{initials}</Text>
          </View>
          <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#111111', marginBottom: 2 }}>{contact.name}</Text>
          {data.job_title ? <Text style={{ fontSize: 9, color: '#666666', marginBottom: 6 }}>{data.job_title}</Text> : null}
          {contact.email ? <Text style={{ ...sideBody, marginBottom: 1 }}>{contact.email}</Text> : null}
          {contact.phone ? <Text style={{ ...sideBody, marginBottom: 1 }}>{contact.phone}</Text> : null}
          {contact.location ? <Text style={{ ...sideBody, marginBottom: 1 }}>{contact.location}</Text> : null}
          {contact.linkedin ? <Text style={{ ...sideBody, marginBottom: 6 }}>{contact.linkedin}</Text> : null}
          {data.skills ? (
            <View>
              <SideHead title="Skills" />
              <Text style={sideBody}>{data.skills}</Text>
            </View>
          ) : null}
          {data.education ? (
            <View>
              <SideHead title="Education" />
              <Text style={sideBody}>{data.education}</Text>
            </View>
          ) : null}
          {data.awards ? (
            <View>
              <SideHead title="Awards" />
              <Text style={sideBody}>{data.awards}</Text>
            </View>
          ) : null}
        </View>
        {/* Main column */}
        <View style={{ flex: 1, paddingHorizontal: 24, paddingVertical: 28 }}>
          {data.summary ? (
            <View style={{ marginBottom: 8 }}>
              <MainHead title="Summary" />
              <Text style={body}>{data.summary}</Text>
            </View>
          ) : null}
          {data.experience?.length ? (
            <View>
              <MainHead title="Experience" />
              {data.experience.map((job, i) => (
                <View key={i} style={{ marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 }}>
                    <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#111111', flex: 1 }}>{job.title}</Text>
                    <Text style={{ fontSize: 9, color: '#888888', fontFamily: 'Helvetica-Oblique' }}>{job.dates}</Text>
                  </View>
                  <Text style={{ fontSize: 9.5, color: '#666666', marginBottom: 3 }}>{job.company}</Text>
                  {job.bullets.map((b, j) => (
                    <View key={j} style={{ flexDirection: 'row', marginBottom: 2, paddingLeft: 8 }}>
                      <Text style={{ fontSize: 9.5, color: '#555555', marginRight: 4 }}>•</Text>
                      <Text style={{ ...body, flex: 1 }}>{b}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </Page>
    </PdfDoc>
  )
}

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

    const limit = await checkAndLog(supabase, user.id, 'rl_generate_resume', 20, 3600)
    if (!limit.ok) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
    }

    // ── Plan gate: monthly generation limit ──────────────────────────────────
    const now = new Date()
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`

    const [usageRes, profileRes] = await Promise.all([
      supabase
        .from('resume_generation_counts')
        .select('count, overage_credits')
        .eq('user_id', user.id)
        .eq('month', month)
        .maybeSingle(),
      supabase
        .from('users')
        .select('plan')
        .eq('id', user.id)
        .single(),
    ])

    const usageRow = usageRes.data as { count?: number; overage_credits?: number } | null
    const profileRow = profileRes.data as { plan?: string } | null

    const plan = (profileRow?.plan ?? 'free') as string
    const count = usageRow?.count ?? 0
    const overageCredits = usageRow?.overage_credits ?? 0

    if (!canGenerate(plan, count, overageCredits)) {
      return NextResponse.json(
        { error: 'Generation limit reached.', code: 'LIMIT_REACHED', plan, count },
        { status: 403 }
      )
    }

    const {
      module_ids,
      jd_id,
      positioning_variant,
      contact,
      summary_override,
      education,
      skills,
      awards_text,
      include_skills_section,
      include_education_section,
      include_awards_section,
      include_summary,
      cover_letter,
      job_level,
      format = 'classic',
      confirmed_phrases,
      confirmed_themes,
      module_augmentations,
    }: {
      module_ids: string[]
      jd_id: string
      positioning_variant: string
      contact: Contact
      summary_override?: string
      education?: EducationEntry[]
      skills?: string[]
      awards_text?: string
      include_skills_section: boolean
      include_education_section: boolean
      include_awards_section?: boolean
      include_summary: boolean
      cover_letter?: CoverLetterConfig
      job_level?: string
      format?: ResumeFormat
      confirmed_phrases?: string[]
      confirmed_themes?: string[]
      module_augmentations?: Record<string, string>
    } = await req.json()

    if (!isUuid(jd_id)) {
      return NextResponse.json({ error: 'Invalid jd_id' }, { status: 400 })
    }
    if (!Array.isArray(module_ids) || module_ids.length === 0 || module_ids.length > 100 || !module_ids.every(isUuid)) {
      return NextResponse.json({ error: 'Invalid module_ids' }, { status: 400 })
    }

    const { data: jd, error: jdError } = await supabase
      .from('job_descriptions')
      .select('*')
      .eq('id', jd_id)
      .eq('user_id', user.id)
      .single()
    if (jdError || !jd) return NextResponse.json({ error: 'Job description not found' }, { status: 404 })

    const { data: modules, error: modError } = await supabase
      .from('modules')
      .select('*')
      .eq('user_id', user.id)
      .in('id', module_ids)
    if (modError) throw modError

    // Build ordered modules (preserving user's selection order) with augmentations applied
    const orderedModules = module_ids
      .map((id: string) => modules.find(m => m.id === id))
      .filter((m): m is Record<string, unknown> => Boolean(m))
      .map((m) => {
        const augmented = module_augmentations?.[String(m.id)]
        return augmented ? { ...m, content: augmented } : m
      })

    // Pre-group by (source_company, source_role_title) to enforce job anchoring.
    // Modules within the same job are clustered so the AI never confuses which
    // bullets belong to which role. Order within each group is preserved.
    const jobKeyOf = (m: Record<string, unknown>) =>
      `${String(m.source_company ?? '')}||${String(m.source_role_title ?? '')}`
    const jobOrder: string[] = []
    const jobGroups = new Map<string, Record<string, unknown>[]>()
    for (const m of orderedModules) {
      const k = jobKeyOf(m)
      if (!jobGroups.has(k)) { jobGroups.set(k, []); jobOrder.push(k) }
      jobGroups.get(k)!.push(m)
    }
    const sortedModules = jobOrder.flatMap(k => jobGroups.get(k)!)

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

    const awardsSection = include_awards_section && awards_text?.trim()
      ? awards_text.trim()
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

    const phrasesToUse: string[] = confirmed_phrases?.length ? confirmed_phrases : (jd.extracted_phrases || [])
    const themesToUse: string[] = confirmed_themes?.length ? confirmed_themes : (jd.extracted_themes || [])

    const atsInstruction = phrasesToUse.length > 0
      ? `KEYWORD OPTIMIZATION RULES:
- You MUST incorporate as many of the following JD key phrases verbatim into the resume as naturally possible: ${phrasesToUse.join(', ')}
- For each JD theme that matches a module, use the exact theme language in bullet points: ${themesToUse.join(', ')}
- Lead every bullet point with a strong action verb
- Prioritize keyword density over stylistic variation — repetition of key terms is acceptable and desirable for ATS
- Do NOT summarize or paraphrase key phrases — use them word-for-word where possible
- Goal: ATS score above 90. Do not omit any phrase from the list.`
      : (themesToUse.length > 0 ? `- Mirror these JD themes naturally: ${themesToUse.join(', ')}` : '')

    const compactInstruction = ''

    // Prefer the literal job title (e.g. "Head of People") over the role-type
    // category slug ("vp-community"). Fall back to role_type → "Resume".
    const roleTitle = (jd.extracted_job_title && String(jd.extracted_job_title).trim())
      || jd.extracted_role_type
      || 'Resume'
    const resumeTitle = `${roleTitle} - ${contact.name}`
    const docxFilename = `${resumeTitle}.docx`

    // ── Combination template: separate structured prompt ──────────────────────
    let resumeHtml: string
    let docxBuffer: Buffer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pdfBuffer: any

    if (format === 'combination') {
      const comboPrompt = `Assemble a tailored resume in structured JSON for: ${jd.extracted_role_type} at ${jd.extracted_company}.

Rules:
- Write punchy, metric-driven bullet points (start each with a strong verb)
${atsInstruction}
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
  "skills_list": ["skill1", "skill2"],
  "awards": "award or certification text, or empty string if none"
}

- skill_sections: one entry per module (use module title as category, convert content to 2–4 bullets)
- work_experience: modules are pre-sorted by job — group consecutive modules with the same source_company into one entry. CRITICAL: each module MUST stay under its own source_company. Never reassign a module to a different company.
- education: ${include_education_section && educationText ? educationText : 'leave as empty array []'}
- skills_list: ${include_skills_section && skillsText ? skillsText : 'leave as empty array []'}
- awards: ${awardsSection ? `include this verbatim: ${awardsSection}` : 'set to empty string ""'}
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
      pdfBuffer = await renderToBuffer(<ResumePDFCombination contact={contact} data={comboData} />)

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
          ${comboData.awards ? `<div style="background:#EDD5D7;padding:6px 12px;font-weight:700;font-size:12px;color:#3D2B2D;margin:16px 0 8px">AWARDS &amp; CERTIFICATIONS</div><p style="font-size:11.5px;color:#333;line-height:1.6;margin:0">${comboData.awards}</p>` : ''}
        </div>
      </body></html>`

    } else {
      // ── Structured prompt for classic / modern / compact ──────────────────
      const prompt = `You are a resume writer. Convert the provided modules into a polished resume for: ${jd.extracted_role_type} at ${jd.extracted_company}.

CRITICAL BULLET RULES — follow exactly:
- Every experience entry MUST have a "bullets" array of 2–4 short bullet strings
- Each bullet MUST be under 20 words
- Each bullet MUST start with a past-tense action verb (Built, Led, Grew, Launched, Managed, Drove, Scaled, etc.)
- Extract specific metrics and outcomes from the module content — do NOT copy the paragraph verbatim
- Do NOT put paragraph text as a single bullet — always decompose into multiple short bullets
${atsInstruction}
${levelInstruction ? `- ${levelInstruction}` : ''}

Summary: ${summaryInstruction}

For the experience array: modules are pre-sorted by job. Group consecutive modules with the same source_company into one experience entry — one entry per (company, role). CRITICAL: Each module MUST appear under its own source_company. Never move a module's bullets to a different company's entry. Convert each module's content into 2–4 bullets as described above. Format dates as "Mon YYYY – Mon YYYY" using date_start/date_end fields (format YYYY-MM). If date_end is null use "Present". Use the earliest date_start and latest date_end across all modules in the same job group for the experience entry's dates.
${include_skills_section && skillsText ? `Skills: list these as a comma-separated string: ${skillsText}` : ''}
${include_education_section && educationText ? `Education: use this verbatim: ${educationText}` : ''}
${awardsSection ? `Awards & Certifications: include this section verbatim: ${awardsSection}` : ''}
${compactInstruction}

Respond with ONLY this JSON structure — no markdown, no explanation:
{
  "job_title": "the exact job title from the job description",
  "summary": "3-4 sentence professional summary",
  "experience": [
    { "title": "Job Title", "company": "Company Name", "dates": "Jan 2020 – Present", "bullets": ["Led team of 8 across 3 regions, delivering 40% growth.", "Built ambassador program reaching 1,200 members in 6 months."] }
  ],
  "skills": "skill1, skill2, skill3",
  "education": "B.S. Communications, UC Berkeley (2017)",
  "awards": "award or certification text, or empty string if none"
}

Modules to convert:
${JSON.stringify(sortedModules.map((m: Record<string, unknown>) => ({ title: m.title, content: m.content, source_company: m.source_company, source_role_title: m.source_role_title, date_start: m.date_start, date_end: m.date_end })))}`

      const rawResponseText = await aiComplete([{ role: 'user', content: prompt }], 4096)
      const stripped = rawResponseText.replace(/```json/g, '').replace(/```/g, '')
      const jsonStart = stripped.indexOf('{'), jsonEnd = stripped.lastIndexOf('}')
      if (jsonStart === -1 || jsonEnd === -1) throw new Error(`Model did not return JSON. Response: ${stripped.slice(0, 200)}`)
      const cleanJson = stripped.slice(jsonStart, jsonEnd + 1)
        .replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/,(\s*[}\]])/g, '$1')
      const resumeData: StructuredData = JSON.parse(cleanJson)

      const structuredData: StructuredData = {
        job_title: resumeData.job_title,
        summary: include_summary ? resumeData.summary : undefined,
        experience: resumeData.experience,
        skills: include_skills_section ? resumeData.skills : undefined,
        education: include_education_section ? resumeData.education : undefined,
        awards: awardsSection || undefined,
      }

      const contactLine = [contact.email, contact.phone, contact.location, contact.linkedin].filter(Boolean).join(' · ')
      resumeHtml = buildResumeHtml(contact, structuredData, format)
      // Two-column is PDF-only — use a lightweight placeholder DOCX
      if (format === 'two-column') {
        const placeholderDoc = buildDocx(contact, structuredData, 'classic', contactLine)
        docxBuffer = await docx.Packer.toBuffer(placeholderDoc) as Buffer
      } else if (format === 'executive' || format === 'minimal') {
        const formatDoc = buildDocxExecutiveOrMinimal(contact, structuredData, format, contactLine)
        docxBuffer = await docx.Packer.toBuffer(formatDoc) as Buffer
      } else {
        const formatDoc = buildDocx(contact, structuredData, format, contactLine)
        docxBuffer = await docx.Packer.toBuffer(formatDoc) as Buffer
      }
      const pdfEl = format === 'tech' ? <ResumePDFTech contact={contact} data={structuredData} />
        : format === 'executive' ? <ResumePDFExecutive contact={contact} data={structuredData} />
        : format === 'minimal' ? <ResumePDFMinimal contact={contact} data={structuredData} />
        : format === 'two-column' ? <ResumePDFTwoColumn contact={contact} data={structuredData} />
        : <ResumePDFClassic contact={contact} data={structuredData} />
      pdfBuffer = await renderToBuffer(pdfEl)
    }

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

    // ── Keyword matching analysis ─────────────────────────────────────────────
    // Strip HTML tags first so angle brackets don't interfere with text matching.
    // Then use word-level fuzzy matching: a keyword is "matched" if ≥50% of its
    // meaningful words (len > 2, not stopwords) appear anywhere in the resume text.
    // This handles paraphrasing — the AI rarely echoes JD phrases verbatim but
    // will use the same key words.
    const KW_STOPWORDS = new Set(['and','or','the','a','an','to','of','in','for','on','with','at','by','from','as','into','that','this','be','is','are','was','were','will','can','may','has','have','had','not','but','it','its','who','how','what','when','where','which','you','your','we','our','their','they','them','these','those'])
    const cleanResumeText = resumeHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase()

    // Score against the confirmed keyword lists (what the user reviewed), not raw JD fields
    const jdKeywords = [...themesToUse, ...phrasesToUse]
      .map((k: string) => k.toLowerCase().trim())
      .filter((k: string, i: number, arr: string[]) => k.length > 1 && arr.indexOf(k) === i)
    const matchedKeywords: string[] = []
    const missingKeywords: string[] = []
    for (const kw of jdKeywords) {
      // 1) Exact phrase match (most reliable)
      if (cleanResumeText.includes(kw)) {
        matchedKeywords.push(kw)
        continue
      }
      // 2) Word-level fuzzy: extract meaningful words (len > 2, not stopwords)
      const kwWords = kw.split(/\W+/).filter(w => w.length > 2 && !KW_STOPWORDS.has(w))
      if (kwWords.length === 0) {
        // Very short keyword — do whole-word check
        const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
        if (re.test(cleanResumeText)) matchedKeywords.push(kw)
        else missingKeywords.push(kw)
        continue
      }
      const hitCount = kwWords.filter(w => cleanResumeText.includes(w)).length
      if (hitCount / kwWords.length >= 0.5) matchedKeywords.push(kw)
      else missingKeywords.push(kw)
    }

    // ── ATS score (composite 0–100) ───────────────────────────────────────────
    // 60% keyword coverage · 20% contact completeness · 10% module count · 10% summary
    const kwScore = jdKeywords.length > 0
      ? Math.round((matchedKeywords.length / jdKeywords.length) * 100)
      : 75 // no keywords to check — give benefit of the doubt
    const contactFields = [contact.name, contact.email, contact.phone, contact.linkedin, contact.location]
    const contactScore = Math.round((contactFields.filter(Boolean).length / 5) * 100)
    const moduleScore = Math.min(module_ids.length, 8) / 8 * 100
    const summaryScore = include_summary ? 100 : 0
    const atsScore = Math.round(kwScore * 0.6 + contactScore * 0.2 + moduleScore * 0.1 + summaryScore * 0.1)

    // Save score back to the DB record
    await supabase
      .from('generated_resumes')
      .update({ ats_score: atsScore })
      .eq('id', resumeId)

    let coverLetterText: string | null = null
    let coverLetterUrl: string | null = null

    // Cover letter is a paid feature — silently skip for free plan
    if (cover_letter?.include && plan !== 'free') {
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

    // Increment monthly resume count (atomic via RPC). Generation already succeeded —
    // log on failure but don't fail the request.
    const { error: incError } = await supabase.rpc('increment_resume_count', {
      p_user_id: user.id,
      p_month: month,
    })
    if (incError) {
      console.error('[generate-resume] increment_resume_count failed:', incError)
    }

    return NextResponse.json({
      resume_id: savedResume.id,
      docx_url: docxSigned?.signedUrl,
      pdf_url: pdfSigned?.signedUrl,
      docx_filename: docxFilename,
      resume_html: resumeHtml,
      cover_letter_text: coverLetterText,
      cover_letter_url: coverLetterUrl,
      matched_keywords: matchedKeywords,
      missing_keywords: missingKeywords,
      ats_score: atsScore,
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
