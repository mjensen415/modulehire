// Resume renderers: HTML preview, DOCX and PDF for every format. Shared by generate-resume
// (first render) and /api/resume-docs/[id]/download (re-render from the edited document).
import * as docx from 'docx'
import { renderToBuffer, Document as PdfDoc, Page, Text, View } from '@react-pdf/renderer'
import React from 'react'
import type { ResumeDoc } from '@/lib/resume-doc'
import { compareResumeRanges, isPresentDate, normalizeCompany, parseResumeDate, splitResumeRange } from '@/lib/resume-dates'

export type Contact = { name: string; email: string; phone?: string; linkedin?: string; location?: string }
export type ResumeFormat = 'classic' | 'tech' | 'combination' | 'executive' | 'minimal' | 'two-column'
export type StructuredData = {
  job_title?: string
  summary?: string
  experience?: { title: string; company: string; dates: string; bullets: string[]; bullet_sources?: string[] }[]
  skills?: string
  education?: string
  awards?: string
}

// ─── COMBINATION TEMPLATE TYPES ───────────────────────────────────────────────
export type CombinationData = {
  job_title: string
  summary: string
  skill_sections: { category: string; bullets: string[] }[]
  work_experience: { title: string; company: string; dates: string; bullets: string[]; bullet_sources?: string[] }[]
  education: { degree: string; school: string; year: string }[]
  skills_list: string[]
  awards?: string
}

// ─── EXPERIENCE GROUPING (stacked roles) ──────────────────────────────────────
// Group experience entries by company so multiple roles at the same employer
// render under a single company header with roles stacked beneath — the format
// Taleo/Workday/Greenhouse/Lever parse correctly for multi-role tenure.

type ExpEntry = { title: string; company: string; dates: string; bullets: string[] }
type CompanyGroup = { company: string; tenure: string; roles: ExpEntry[] }

// Group by normalized company ("Fiverr" / "Fiverr International", "33Crickets" / "33 Crickets"),
// keeping the first-seen display name. Roles within a company and companies themselves follow
// compareResumeRanges: current roles first, then by end date, undated last. Company tenure =
// earliest start → latest end (or "Present" if any role is open). Every format (HTML preview,
// DOCX, PDF) renders through this, so they all match.
export function groupExperienceByCompany(experience: ExpEntry[]): CompanyGroup[] {
  const byRange = (a: ExpEntry, b: ExpEntry) => {
    const [as, ae] = splitResumeRange(a.dates)
    const [bs, be] = splitResumeRange(b.dates)
    return compareResumeRanges(as, ae, bs, be)
  }
  const map = new Map<string, ExpEntry[]>()
  const displayName = new Map<string, string>()
  const order: string[] = []
  for (const e of experience) {
    const key = normalizeCompany(e.company) || (e.company ?? '').trim().toLowerCase()
    if (!map.has(key)) { map.set(key, []); displayName.set(key, e.company ?? ''); order.push(key) }
    map.get(key)!.push(e)
  }
  const groups: CompanyGroup[] = order.map(key => {
    const roles = [...map.get(key)!].sort(byRange)
    const starts = roles.map(r => splitResumeRange(r.dates)[0]).filter(d => parseResumeDate(d))
    const oldestStart = [...starts].sort((x, y) => compareResumeRanges(y, y, x, x))[0] ?? ''
    const anyPresent = roles.some(r => isPresentDate(splitResumeRange(r.dates)[1]))
    const end = anyPresent ? 'Present' : splitResumeRange(roles[0].dates)[1]
    const tenure = oldestStart && end && oldestStart !== end ? `${oldestStart} to ${end}` : (roles[0].dates ?? '')
    return { company: displayName.get(key)!, tenure, roles }
  })
  groups.sort((a, b) => byRange(a.roles[0], b.roles[0]))
  return groups
}

// ─── HTML PREVIEW ─────────────────────────────────────────────────────────────

// Renders a bullet list honoring the chosen prefix glyph. An empty bulletStyle
// means "no marker" — plain lines with no leading glyph or space.
export function htmlBullets(bullets: string[], liStyle: string, bulletStyle: string, ulMargin = '4px 0 0 0'): string {
  const prefix = bulletStyle === '' ? '' : `${bulletStyle} `
  return `<ul style="list-style:none;margin:${ulMargin};padding-left:0">${bullets.map(b => `<li style="${liStyle}">${prefix}${b}</li>`).join('')}</ul>`
}

export function buildResumeHtml(contact: Contact, data: StructuredData, format: ResumeFormat, bulletStyle: string): string {
  const contactLine = [contact.email, contact.phone, contact.location, contact.linkedin].filter(Boolean).join(' · ')

  const renderJobs = (jobs: NonNullable<StructuredData['experience']>, fonts: { body: string; size: string }) => {
    const liStyle = `font-family:${fonts.body};font-size:${fonts.size};line-height:1.6;color:#333;margin-bottom:1px`
    return groupExperienceByCompany(jobs).map(group => {
      if (group.roles.length === 1) {
        const job = group.roles[0]
        return `
      <div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <span style="font-family:${fonts.body};font-size:${fonts.size};font-weight:700;color:#222">${job.title} · ${job.company}</span>
          <span style="font-family:${fonts.body};font-size:${fonts.size};color:#888;font-style:italic;white-space:nowrap;margin-left:8px">${job.dates}</span>
        </div>
        ${htmlBullets(job.bullets, liStyle, bulletStyle)}
      </div>`
      }
      const roles = group.roles.map(job => `
        <div style="margin:6px 0 0 12px">
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <span style="font-family:${fonts.body};font-size:${fonts.size};font-weight:600;color:#333">${job.title}</span>
            <span style="font-family:${fonts.body};font-size:${fonts.size};color:#888;font-style:italic;white-space:nowrap;margin-left:8px">${job.dates}</span>
          </div>
          ${htmlBullets(job.bullets, liStyle, bulletStyle)}
        </div>`).join('')
      return `
      <div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <span style="font-family:${fonts.body};font-size:${fonts.size};font-weight:700;color:#222">${group.company}</span>
          <span style="font-family:${fonts.body};font-size:${fonts.size};color:#888;font-style:italic;white-space:nowrap;margin-left:8px">${group.tenure}</span>
        </div>${roles}
      </div>`
    }).join('')
  }

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
    const techLi = `font-family:${f};font-size:${sz};line-height:1.6;color:#333;margin-bottom:2px`
    const renderTechJobs = (jobs: NonNullable<StructuredData['experience']>) =>
      groupExperienceByCompany(jobs).map(group => {
        if (group.roles.length === 1) {
          const job = group.roles[0]
          return `
        <div style="margin-bottom:13px">
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <span style="font-family:${f};font-size:12.5px;font-weight:700;color:#111">${job.title} · ${job.company}</span>
            <span style="font-family:${mono};font-size:10px;color:#555;white-space:nowrap;margin-left:8px">${job.dates}</span>
          </div>
          ${htmlBullets(job.bullets, techLi, bulletStyle)}
        </div>`
        }
        const roles = group.roles.map(job => `
          <div style="margin:6px 0 0 12px">
            <div style="display:flex;justify-content:space-between;align-items:baseline">
              <span style="font-family:${f};font-size:12px;font-weight:600;color:#222">${job.title}</span>
              <span style="font-family:${mono};font-size:10px;color:#555;white-space:nowrap;margin-left:8px">${job.dates}</span>
            </div>
            ${htmlBullets(job.bullets, techLi, bulletStyle)}
          </div>`).join('')
        return `
        <div style="margin-bottom:13px">
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <span style="font-family:${f};font-size:12.5px;font-weight:700;color:#111">${group.company}</span>
            <span style="font-family:${mono};font-size:10px;color:#555;white-space:nowrap;margin-left:8px">${group.tenure}</span>
          </div>${roles}
        </div>`
      }).join('')
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
    const minimalLi = `font-family:${f};font-size:${sz};line-height:1.65;color:#444;margin-bottom:1px`
    const renderMinimalJobs = (jobs: NonNullable<StructuredData['experience']>) =>
      groupExperienceByCompany(jobs).map(group => {
        if (group.roles.length === 1) {
          const job = group.roles[0]
          return `
      <div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <span style="font-family:${f};font-size:12.5px;font-weight:500;color:#111">${job.company}</span>
          <span style="font-family:${f};font-size:10px;color:#aaa;white-space:nowrap;margin-left:8px">${job.dates}</span>
        </div>
        <div style="font-family:${f};font-size:11px;color:#666;margin-bottom:4px">${job.title}</div>
        ${htmlBullets(job.bullets, minimalLi, bulletStyle)}
      </div>`
        }
        const roles = group.roles.map(job => `
        <div style="margin:6px 0 0 12px">
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <span style="font-family:${f};font-size:11px;color:#666">${job.title}</span>
            <span style="font-family:${f};font-size:10px;color:#aaa;white-space:nowrap;margin-left:8px">${job.dates}</span>
          </div>
          ${htmlBullets(job.bullets, minimalLi, bulletStyle)}
        </div>`).join('')
        return `
      <div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <span style="font-family:${f};font-size:12.5px;font-weight:500;color:#111">${group.company}</span>
          <span style="font-family:${f};font-size:10px;color:#aaa;white-space:nowrap;margin-left:8px">${group.tenure}</span>
        </div>${roles}
      </div>`
      }).join('')
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

export function buildDocx(contact: Contact, data: StructuredData, format: ResumeFormat, contactLine: string, bulletStyle: string): docx.Document {
  const twip = (inches: number) => Math.round(inches * 1440)
  const useBullet = bulletStyle !== ''
  const bulletRef = 'body-bullets'
  const bulletConfig = [{ reference: bulletRef, levels: [{ level: 0, format: docx.LevelFormat.BULLET, text: bulletStyle || '\u2022', alignment: docx.AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 220 } } } }] }]
  // Empty bulletStyle \u2192 plain paragraph, no marker, no hanging indent.
  const bul = (text: string, size: number, font: string) => new docx.Paragraph({
    ...(useBullet ? { numbering: { reference: bulletRef, level: 0 } } : {}),
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
        ...groupExperienceByCompany(data.experience).flatMap(group => {
          if (group.roles.length === 1) {
            const job = group.roles[0]
            return [
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
            ]
          }
          return [
            new docx.Paragraph({
              spacing: { before: 140, after: 40, line: 276 },
              tabStops: [{ type: docx.TabStopType.RIGHT, position: docx.TabStopPosition.MAX }],
              children: [
                new docx.TextRun({ text: group.company, bold: true, size: 22, font }),
                new docx.TextRun({ text: '\t' + group.tenure, size: 20, font, color: '777777', italics: true }),
              ],
            }),
            ...group.roles.flatMap(job => [
              new docx.Paragraph({
                spacing: { before: 40, after: 40 },
                tabStops: [{ type: docx.TabStopType.RIGHT, position: docx.TabStopPosition.MAX }],
                children: [
                  new docx.TextRun({ text: job.title, size: 21, font, italics: true }),
                  new docx.TextRun({ text: '\t' + job.dates, size: 19, font, color: '777777', italics: true }),
                ],
              }),
              ...job.bullets.map(b => bul(b, 22, font)),
            ]),
          ]
        }),
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
      ...groupExperienceByCompany(data.experience).flatMap(group => {
        if (group.roles.length === 1) {
          const job = group.roles[0]
          return [
            new docx.Paragraph({
              spacing: { before: 140, after: 30, line: 276 },
              tabStops: [{ type: docx.TabStopType.RIGHT, position: docx.TabStopPosition.MAX }],
              children: [
                new docx.TextRun({ text: `${job.title} · ${job.company}`, bold: true, size: 22, font }),
                new docx.TextRun({ text: '\t' + job.dates, size: 18, font: 'Courier New', color: '555555' }),
              ],
            }),
            ...job.bullets.map(b => bul(b, 21, font)),
          ]
        }
        return [
          new docx.Paragraph({
            spacing: { before: 140, after: 30, line: 276 },
            tabStops: [{ type: docx.TabStopType.RIGHT, position: docx.TabStopPosition.MAX }],
            children: [
              new docx.TextRun({ text: group.company, bold: true, size: 22, font }),
              new docx.TextRun({ text: '\t' + group.tenure, size: 18, font: 'Courier New', color: '555555' }),
            ],
          }),
          ...group.roles.flatMap(job => [
            new docx.Paragraph({
              spacing: { before: 40, after: 20, line: 276 },
              indent: { left: 180 },
              tabStops: [{ type: docx.TabStopType.RIGHT, position: docx.TabStopPosition.MAX }],
              children: [
                new docx.TextRun({ text: job.title, bold: true, size: 21, font }),
                new docx.TextRun({ text: '\t' + job.dates, size: 18, font: 'Courier New', color: '555555' }),
              ],
            }),
            ...job.bullets.map(b => bul(b, 21, font)),
          ]),
        ]
      }),
    ] : []),
    ...(data.skills ? [sectionHead('Skills'), new docx.Paragraph({ children: [new docx.TextRun({ text: data.skills, size: 21, font })], spacing: { after: 100, line: 276 } })] : []),
    ...(data.education ? [sectionHead('Education'), new docx.Paragraph({ children: [new docx.TextRun({ text: data.education, size: 21, font })], spacing: { after: 100, line: 276 } })] : []),
    ...(data.awards ? [sectionHead('Awards & Certifications'), new docx.Paragraph({ children: [new docx.TextRun({ text: data.awards, size: 21, font })], spacing: { after: 100, line: 276 } })] : []),
  ]
  return new docx.Document({ creator: contact.name, numbering: { config: bulletConfig }, sections: [{ properties: { page: { margin: { top: twip(0.85), right: twip(0.85), bottom: twip(0.85), left: twip(0.85) } } }, children }] })
}

export function buildDocxExecutiveOrMinimal(contact: Contact, data: StructuredData, format: 'executive' | 'minimal', contactLine: string, bulletStyle: string): docx.Document {
  const twip = (inches: number) => Math.round(inches * 1440)
  const useBullet = bulletStyle !== ''
  const bulletRef = 'body-bullets'
  const bulletConfig = [{ reference: bulletRef, levels: [{ level: 0, format: docx.LevelFormat.BULLET, text: bulletStyle || '•', alignment: docx.AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 220 } } } }] }]
  const bul = (text: string, size: number, font: string) => new docx.Paragraph({
    ...(useBullet ? { numbering: { reference: bulletRef, level: 0 } } : {}),
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
        ...groupExperienceByCompany(data.experience).flatMap(group => {
          if (group.roles.length === 1) {
            const job = group.roles[0]
            return [
              new docx.Paragraph({
                tabStops: [{ type: docx.TabStopType.RIGHT, position: docx.TabStopPosition.MAX }],
                spacing: { before: 140, after: 40 },
                children: [
                  new docx.TextRun({ text: `${job.title} · ${job.company}`, bold: true, size: 22, font }),
                  new docx.TextRun({ text: `\t${job.dates}`, size: 18, font, color: '888888', italics: true }),
                ],
              }),
              ...job.bullets.map(b => bul(b, 22, font)),
            ]
          }
          return [
            new docx.Paragraph({
              tabStops: [{ type: docx.TabStopType.RIGHT, position: docx.TabStopPosition.MAX }],
              spacing: { before: 140, after: 40 },
              children: [
                new docx.TextRun({ text: group.company, bold: true, size: 22, font }),
                new docx.TextRun({ text: `\t${group.tenure}`, size: 18, font, color: '888888', italics: true }),
              ],
            }),
            ...group.roles.flatMap(job => [
              new docx.Paragraph({
                tabStops: [{ type: docx.TabStopType.RIGHT, position: docx.TabStopPosition.MAX }],
                spacing: { before: 40, after: 30 },
                indent: { left: 180 },
                children: [
                  new docx.TextRun({ text: job.title, bold: true, size: 21, font, italics: true }),
                  new docx.TextRun({ text: `\t${job.dates}`, size: 18, font, color: '888888', italics: true }),
                ],
              }),
              ...job.bullets.map(b => bul(b, 22, font)),
            ]),
          ]
        }),
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
      ...groupExperienceByCompany(data.experience).flatMap(group => {
        if (group.roles.length === 1) {
          const job = group.roles[0]
          return [
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
          ]
        }
        return [
          new docx.Paragraph({
            tabStops: [{ type: docx.TabStopType.RIGHT, position: docx.TabStopPosition.MAX }],
            spacing: { before: 120, after: 20 },
            children: [
              new docx.TextRun({ text: group.company, bold: true, size: 22, font }),
              new docx.TextRun({ text: `\t${group.tenure}`, size: 18, font, color: 'aaaaaa' }),
            ],
          }),
          ...group.roles.flatMap(job => [
            new docx.Paragraph({
              tabStops: [{ type: docx.TabStopType.RIGHT, position: docx.TabStopPosition.MAX }],
              spacing: { before: 40, after: 30 },
              indent: { left: 180 },
              children: [
                new docx.TextRun({ text: job.title, size: 20, font, color: '666666', italics: true }),
                new docx.TextRun({ text: `\t${job.dates}`, size: 18, font, color: 'aaaaaa' }),
              ],
            }),
            ...job.bullets.map(b => bul(b, 21, font)),
          ]),
        ]
      }),
    ] : []),
    ...(data.skills ? [sectionHead('Skills'), new docx.Paragraph({ children: [new docx.TextRun({ text: data.skills, size: 21, font, color: '444444' })], spacing: { after: 100, line: 276 } })] : []),
    ...(data.education ? [sectionHead('Education'), new docx.Paragraph({ children: [new docx.TextRun({ text: data.education, size: 21, font, color: '444444' })], spacing: { after: 100, line: 276 } })] : []),
    ...(data.awards ? [sectionHead('Awards & Certifications'), new docx.Paragraph({ children: [new docx.TextRun({ text: data.awards, size: 21, font, color: '444444' })], spacing: { after: 100, line: 276 } })] : []),
  ]
  return new docx.Document({ creator: contact.name, numbering: { config: bulletConfig }, sections: [{ properties: { page: { margin: { top: twip(1), right: twip(1), bottom: twip(1), left: twip(1) } } }, children }] })
}


// ─── COMBINATION DOCX BUILDER ────────────────────────────────────────────────

export function buildDocxCombination(contact: Contact, data: CombinationData, bulletStyle: string): docx.Document {
  const twip = (inches: number) => Math.round(inches * 1440)
  const useBullet = bulletStyle !== ''
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
    ...(useBullet ? { numbering: { reference: 'combo-bullets', level: 0 } } : {}),
    spacing: { before: 40, after: 40, line: 276 },
    children: [new docx.TextRun({ text, size: 20, font: 'Calibri', color: '222222' })],
  })

  const spacer = (space = 120) => new docx.Paragraph({ spacing: { before: 0, after: space } })

  return new docx.Document({
    numbering: {
      config: [{
        reference: 'combo-bullets',
        levels: [{ level: 0, format: docx.LevelFormat.BULLET, text: bulletStyle || '\u2022', alignment: docx.AlignmentType.LEFT,
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
        ...groupExperienceByCompany(data.work_experience).flatMap(group => {
          if (group.roles.length === 1) {
            const job = group.roles[0]
            return [
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
            ]
          }
          return [
            new docx.Paragraph({
              spacing: { before: 120, after: 40 },
              tabStops: [{ type: docx.TabStopType.RIGHT, position: docx.TabStopPosition.MAX }],
              children: [
                new docx.TextRun({ text: group.company, bold: true, size: 21, font: 'Calibri', color: '222222' }),
                new docx.TextRun({ text: '\t' + group.tenure, size: 19, font: 'Calibri', color: '777777', italics: true }),
              ],
            }),
            ...group.roles.flatMap(job => [
              new docx.Paragraph({
                spacing: { before: 40, after: 40 },
                indent: { left: 180 },
                tabStops: [{ type: docx.TabStopType.RIGHT, position: docx.TabStopPosition.MAX }],
                children: [
                  new docx.TextRun({ text: job.title, bold: true, size: 20, font: 'Calibri', color: '444444' }),
                  new docx.TextRun({ text: '\t' + job.dates, size: 19, font: 'Calibri', color: '777777', italics: true }),
                ],
              }),
              ...job.bullets.map(b => bullet(b)),
            ]),
            spacer(100),
          ]
        }),

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

export type EducationEntry = { school: string; degree: string; field: string; year: string }
export type CoverLetterConfig = { include: boolean; tone: 'professional' | 'warm' | 'direct'; notes?: string }

// ── Classic PDF: Times-Roman serif, small-caps section headers ──────────────
export const ResumePDFClassic = ({ contact, data, bulletStyle }: { contact: Contact; data: StructuredData; bulletStyle: string }) => {
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
            {groupExperienceByCompany(data.experience).map((group, i) => {
              const bullets = (job: ExpEntry) => job.bullets.map((b, j) => (
                <View key={j} style={{ flexDirection: 'row', marginBottom: 2, paddingLeft: 8 }}>
                  {bulletStyle !== '' && <Text style={{ fontSize: 9.5, fontFamily: 'Times-Roman', color: '#555555', marginRight: 4 }}>{bulletStyle}</Text>}
                  <Text style={{ fontSize: 9.5, fontFamily: 'Times-Roman', color: '#333333', lineHeight: 1.45, flex: 1 }}>{b}</Text>
                </View>
              ))
              if (group.roles.length === 1) {
                const job = group.roles[0]
                return (
                  <View key={i} style={{ marginTop: 8, marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 }}>
                      <Text style={{ fontSize: 10, fontFamily: 'Times-Bold', color: '#222222' }}>{job.company}</Text>
                      <Text style={{ fontSize: 9, fontFamily: 'Times-Italic', color: '#777777' }}>{job.dates}</Text>
                    </View>
                    <Text style={{ fontSize: 9.5, fontFamily: 'Times-Italic', color: '#444444', marginBottom: 3 }}>{job.title}</Text>
                    {bullets(job)}
                  </View>
                )
              }
              return (
                <View key={i} style={{ marginTop: 8, marginBottom: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 }}>
                    <Text style={{ fontSize: 10, fontFamily: 'Times-Bold', color: '#222222' }}>{group.company}</Text>
                    <Text style={{ fontSize: 9, fontFamily: 'Times-Italic', color: '#777777' }}>{group.tenure}</Text>
                  </View>
                  {group.roles.map((job, r) => (
                    <View key={r} style={{ marginLeft: 10, marginTop: 3 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 }}>
                        <Text style={{ fontSize: 9.5, fontFamily: 'Times-Italic', color: '#444444' }}>{job.title}</Text>
                        <Text style={{ fontSize: 9, fontFamily: 'Times-Italic', color: '#777777' }}>{job.dates}</Text>
                      </View>
                      {bullets(job)}
                    </View>
                  ))}
                </View>
              )
            })}
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
export const ResumePDFTech = ({ contact, data, bulletStyle }: { contact: Contact; data: StructuredData; bulletStyle: string }) => {
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
            {groupExperienceByCompany(data.experience).map((group, i) => {
              const bullets = (job: ExpEntry) => job.bullets.map((b, j) => (
                <View key={j} style={{ flexDirection: 'row', marginBottom: 2, paddingLeft: 8 }}>
                  {bulletStyle !== '' && <Text style={{ fontSize: 9.5, color: '#555555', marginRight: 4 }}>{bulletStyle}</Text>}
                  <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica', color: '#333333', lineHeight: 1.45, flex: 1 }}>{b}</Text>
                </View>
              ))
              if (group.roles.length === 1) {
                const job = group.roles[0]
                return (
                  <View key={i} style={{ marginTop: 8, marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 3 }}>
                      <Text style={{ fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: '#111111' }}>{job.title} · {job.company}</Text>
                      <Text style={{ fontSize: 9, fontFamily: 'Courier', color: '#555555' }}>{job.dates}</Text>
                    </View>
                    {bullets(job)}
                  </View>
                )
              }
              return (
                <View key={i} style={{ marginTop: 8, marginBottom: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 3 }}>
                    <Text style={{ fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: '#111111' }}>{group.company}</Text>
                    <Text style={{ fontSize: 9, fontFamily: 'Courier', color: '#555555' }}>{group.tenure}</Text>
                  </View>
                  {group.roles.map((job, r) => (
                    <View key={r} style={{ marginLeft: 10, marginBottom: 2 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 2 }}>
                        <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#222222' }}>{job.title}</Text>
                        <Text style={{ fontSize: 9, fontFamily: 'Courier', color: '#555555' }}>{job.dates}</Text>
                      </View>
                      {bullets(job)}
                    </View>
                  ))}
                </View>
              )
            })}
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
export const ResumePDFCombination = ({ contact, data, bulletStyle }: { contact: Contact; data: CombinationData; bulletStyle: string }) => {
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
                  {bulletStyle !== '' && <Text style={{ fontSize: 9.5, color: '#555555', marginRight: 4 }}>{bulletStyle}</Text>}
                  <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica', color: '#333333', lineHeight: 1.45, flex: 1 }}>{b}</Text>
                </View>
              ))}
            </View>
          ))}
          <View style={{ marginTop: 10 }}>
            <SectionBanner title="Work Experience" />
            {groupExperienceByCompany(data.work_experience).map((group, i) => {
              const bullets = (job: ExpEntry) => job.bullets.map((b, j) => (
                <View key={j} style={{ flexDirection: 'row', marginBottom: 2, paddingLeft: 8 }}>
                  {bulletStyle !== '' && <Text style={{ fontSize: 9.5, color: '#555555', marginRight: 4 }}>{bulletStyle}</Text>}
                  <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica', color: '#333333', lineHeight: 1.45, flex: 1 }}>{b}</Text>
                </View>
              ))
              if (group.roles.length === 1) {
                const job = group.roles[0]
                return (
                  <View key={i} style={{ marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 }}>
                      <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#222222' }}>{job.title}</Text>
                      <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Oblique', color: '#777777' }}>{job.dates}</Text>
                    </View>
                    <Text style={{ fontSize: 9.5, color: '#666666', marginBottom: 3 }}>{job.company}</Text>
                    {bullets(job)}
                  </View>
                )
              }
              return (
                <View key={i} style={{ marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 }}>
                    <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#222222' }}>{group.company}</Text>
                    <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Oblique', color: '#777777' }}>{group.tenure}</Text>
                  </View>
                  {group.roles.map((job, r) => (
                    <View key={r} style={{ marginLeft: 10, marginTop: 3 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 }}>
                        <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: '#444444' }}>{job.title}</Text>
                        <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Oblique', color: '#777777' }}>{job.dates}</Text>
                      </View>
                      {bullets(job)}
                    </View>
                  ))}
                </View>
              )
            })}
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
export const ResumePDFExecutive = ({ contact, data, bulletStyle }: { contact: Contact; data: StructuredData; bulletStyle: string }) => {
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
              {groupExperienceByCompany(data.experience).map((group, i) => {
                const bullets = (job: ExpEntry) => job.bullets.map((b, j) => (
                  <View key={j} style={{ flexDirection: 'row', marginBottom: 2, paddingLeft: 8 }}>
                    {bulletStyle !== '' && <Text style={{ fontSize: 9.5, color: '#555555', marginRight: 4 }}>{bulletStyle}</Text>}
                    <Text style={{ ...body, flex: 1 }}>{b}</Text>
                  </View>
                ))
                if (group.roles.length === 1) {
                  const job = group.roles[0]
                  return (
                    <View key={i} style={{ marginBottom: 9 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 }}>
                        <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#111111', flex: 1 }}>{job.title} · {job.company}</Text>
                        <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Oblique', color: '#888888' }}>{job.dates}</Text>
                      </View>
                      {bullets(job)}
                    </View>
                  )
                }
                return (
                  <View key={i} style={{ marginBottom: 9 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 }}>
                      <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#111111', flex: 1 }}>{group.company}</Text>
                      <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Oblique', color: '#888888' }}>{group.tenure}</Text>
                    </View>
                    {group.roles.map((job, r) => (
                      <View key={r} style={{ marginLeft: 10, marginTop: 3 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 }}>
                          <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: '#333333', flex: 1 }}>{job.title}</Text>
                          <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Oblique', color: '#888888' }}>{job.dates}</Text>
                        </View>
                        {bullets(job)}
                      </View>
                    ))}
                  </View>
                )
              })}
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
export const ResumePDFMinimal = ({ contact, data, bulletStyle }: { contact: Contact; data: StructuredData; bulletStyle: string }) => {
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
            {groupExperienceByCompany(data.experience).map((group, i) => {
              const bullets = (job: ExpEntry) => job.bullets.map((b, j) => (
                <View key={j} style={{ flexDirection: 'row', marginBottom: 2, paddingLeft: 8 }}>
                  {bulletStyle !== '' && <Text style={{ fontSize: 9.5, color: '#aaaaaa', marginRight: 4 }}>{bulletStyle}</Text>}
                  <Text style={{ ...body, flex: 1 }}>{b}</Text>
                </View>
              ))
              if (group.roles.length === 1) {
                const job = group.roles[0]
                return (
                  <View key={i} style={{ marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 }}>
                      <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#111111' }}>{job.company}</Text>
                      <Text style={{ fontSize: 9, color: '#aaaaaa' }}>{job.dates}</Text>
                    </View>
                    <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Oblique', color: '#666666', marginBottom: 3 }}>{job.title}</Text>
                    {bullets(job)}
                  </View>
                )
              }
              return (
                <View key={i} style={{ marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 }}>
                    <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#111111' }}>{group.company}</Text>
                    <Text style={{ fontSize: 9, color: '#aaaaaa' }}>{group.tenure}</Text>
                  </View>
                  {group.roles.map((job, r) => (
                    <View key={r} style={{ marginLeft: 10, marginTop: 3 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 }}>
                        <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Oblique', color: '#666666' }}>{job.title}</Text>
                        <Text style={{ fontSize: 9, color: '#aaaaaa' }}>{job.dates}</Text>
                      </View>
                      {bullets(job)}
                    </View>
                  ))}
                </View>
              )
            })}
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
export const ResumePDFTwoColumn = ({ contact, data, bulletStyle }: { contact: Contact; data: StructuredData; bulletStyle: string }) => {
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
              {groupExperienceByCompany(data.experience).map((group, i) => {
                const bullets = (job: ExpEntry) => job.bullets.map((b, j) => (
                  <View key={j} style={{ flexDirection: 'row', marginBottom: 2, paddingLeft: 8 }}>
                    {bulletStyle !== '' && <Text style={{ fontSize: 9.5, color: '#555555', marginRight: 4 }}>{bulletStyle}</Text>}
                    <Text style={{ ...body, flex: 1 }}>{b}</Text>
                  </View>
                ))
                if (group.roles.length === 1) {
                  const job = group.roles[0]
                  return (
                    <View key={i} style={{ marginBottom: 10 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 }}>
                        <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#111111', flex: 1 }}>{job.title}</Text>
                        <Text style={{ fontSize: 9, color: '#888888', fontFamily: 'Helvetica-Oblique' }}>{job.dates}</Text>
                      </View>
                      <Text style={{ fontSize: 9.5, color: '#666666', marginBottom: 3 }}>{job.company}</Text>
                      {bullets(job)}
                    </View>
                  )
                }
                return (
                  <View key={i} style={{ marginBottom: 10 }}>
                    <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#111111', marginBottom: 1 }}>{group.company}</Text>
                    <Text style={{ fontSize: 9, color: '#888888', fontFamily: 'Helvetica-Oblique', marginBottom: 3 }}>{group.tenure}</Text>
                    {group.roles.map((job, r) => (
                      <View key={r} style={{ marginLeft: 8, marginBottom: 3 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 }}>
                          <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: '#333333', flex: 1 }}>{job.title}</Text>
                          <Text style={{ fontSize: 9, color: '#888888', fontFamily: 'Helvetica-Oblique' }}>{job.dates}</Text>
                        </View>
                        {bullets(job)}
                      </View>
                    ))}
                  </View>
                )
              })}
            </View>
          ) : null}
        </View>
      </Page>
    </PdfDoc>
  )
}


// ─── RENDER ENTRY POINT ───────────────────────────────────────────────────────

export type RenderInput =
  | { format: 'combination'; contact: Contact; data: CombinationData; bulletStyle: string }
  | { format: Exclude<ResumeFormat, 'combination'>; contact: Contact; data: StructuredData; bulletStyle: string }

const comboLi = 'font-size:11.5px;color:#333;line-height:1.6;margin-bottom:2px'

function buildCombinationHtml(contact: Contact, comboData: CombinationData, bullet_style: string): string {
  const skillsHtml = comboData.skill_sections.map(sec => `
        <div style="margin-bottom:14px">
          <div style="font-weight:700;font-size:12px;color:#7A4A4E;margin-bottom:4px">${sec.category}</div>
          ${htmlBullets(sec.bullets, comboLi, bullet_style, '0')}
        </div>`).join('')
  const expHtml = groupExperienceByCompany(comboData.work_experience).map(group => {
    if (group.roles.length === 1) {
      const job = group.roles[0]
      return `
        <div style="margin-bottom:14px">
          <div style="display:flex;justify-content:space-between"><span style="font-weight:700;font-size:12px">${job.title}</span><span style="font-size:11px;color:#888;font-style:italic">${job.dates}</span></div>
          <div style="font-size:11px;color:#666;margin-bottom:4px">${job.company}</div>
          ${htmlBullets(job.bullets, comboLi, bullet_style, '0')}
        </div>`
    }
    const roles = group.roles.map(job => `
          <div style="margin:6px 0 0 12px">
            <div style="display:flex;justify-content:space-between"><span style="font-weight:600;font-size:11.5px;color:#444">${job.title}</span><span style="font-size:11px;color:#888;font-style:italic">${job.dates}</span></div>
            ${htmlBullets(job.bullets, comboLi, bullet_style, '0')}
          </div>`).join('')
    return `
        <div style="margin-bottom:14px">
          <div style="display:flex;justify-content:space-between"><span style="font-weight:700;font-size:12px">${group.company}</span><span style="font-size:11px;color:#888;font-style:italic">${group.tenure}</span></div>${roles}
        </div>`
  }).join('')
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#fff;font-family:Calibri,Candara,sans-serif">
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
}

/** Renders one resume to all three outputs. */
export async function renderResume(input: RenderInput): Promise<{ html: string; docx: Buffer; pdf: Buffer }> {
  const { contact, bulletStyle } = input
  if (input.format === 'combination') {
    const docxBuffer = await docx.Packer.toBuffer(buildDocxCombination(contact, input.data, bulletStyle)) as Buffer
    const pdf = await renderToBuffer(<ResumePDFCombination contact={contact} data={input.data} bulletStyle={bulletStyle} />)
    return { html: buildCombinationHtml(contact, input.data, bulletStyle), docx: docxBuffer, pdf: pdf as Buffer }
  }
  const { format, data } = input
  const contactLine = [contact.email, contact.phone, contact.location, contact.linkedin].filter(Boolean).join(' · ')
  // Two-column is PDF-only — use a lightweight classic DOCX as the placeholder
  const docxDoc = format === 'two-column'
    ? buildDocx(contact, data, 'classic', contactLine, bulletStyle)
    : format === 'executive' || format === 'minimal'
      ? buildDocxExecutiveOrMinimal(contact, data, format, contactLine, bulletStyle)
      : buildDocx(contact, data, format, contactLine, bulletStyle)
  const docxBuffer = await docx.Packer.toBuffer(docxDoc) as Buffer
  const pdfEl = format === 'tech' ? <ResumePDFTech contact={contact} data={data} bulletStyle={bulletStyle} />
    : format === 'executive' ? <ResumePDFExecutive contact={contact} data={data} bulletStyle={bulletStyle} />
    : format === 'minimal' ? <ResumePDFMinimal contact={contact} data={data} bulletStyle={bulletStyle} />
    : format === 'two-column' ? <ResumePDFTwoColumn contact={contact} data={data} bulletStyle={bulletStyle} />
    : <ResumePDFClassic contact={contact} data={data} bulletStyle={bulletStyle} />
  const pdf = await renderToBuffer(pdfEl)
  return { html: buildResumeHtml(contact, data, format, bulletStyle), docx: docxBuffer, pdf: pdf as Buffer }
}

// ─── RESUME DOCUMENT → TEMPLATE INPUT ────────────────────────────────────────
// The edited document (src/lib/resume-doc.ts) is the source of truth; every template renders
// from it through this adapter, so a download always matches what the editor shows.

export function docToRenderInput(doc: ResumeDoc): RenderInput {
  const f = doc.header.contact_fields
  const contact: Contact = { name: doc.header.name, email: f.email, phone: f.phone, location: f.location, linkedin: f.linkedin }
  const lines = (blocks: { text: string }[]) => blocks.map(b => b.text.trim()).filter(Boolean)
  const experience = doc.experience.map(e => ({ title: e.title, company: e.company, dates: e.dates, bullets: lines(e.bullets) }))
  if (doc.format === 'combination') {
    return {
      format: 'combination',
      contact,
      bulletStyle: doc.bullet_style,
      data: {
        job_title: doc.header.title,
        summary: doc.summary.text.trim(),
        skill_sections: doc.skill_sections.map(s => ({ category: s.category, bullets: lines(s.bullets) })).filter(s => s.bullets.length > 0),
        work_experience: experience,
        education: lines(doc.education).map(text => ({ degree: text, school: '', year: '' })),
        skills_list: doc.skills,
        awards: doc.awards.trim(),
      },
    }
  }
  return {
    format: doc.format,
    contact,
    bulletStyle: doc.bullet_style,
    data: {
      job_title: doc.header.title,
      summary: doc.summary.text.trim() || undefined,
      experience,
      skills: doc.skills.join(', ') || undefined,
      education: lines(doc.education).join(' · ') || undefined,
      awards: doc.awards.trim() || undefined,
    },
  }
}
