// Data for the resume preview card (MCP Apps, src/lib/mcp/card-html.ts). get_resume,
// update_block and generate_resume return it as `structuredContent` next to their usual text
// result, so hosts that render MCP Apps show the card and text-only hosts lose nothing.
import type { McpServer } from '@modelcontextprotocol/server'
import { registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server'
import { visibleDoc, type ResumeDoc } from '@/lib/resume-doc'
import type { ToolResult } from './run-tool'
import { RESUME_CARD_HTML } from './card-html'

export const RESUME_CARD_URI = 'ui://modulehire/resume-card.html'

export type ResumeCard = {
  kind: 'resume_card'
  resume_id: string
  version: number
  name: string
  title: string
  for_job: string | null
  fit: { overall: number; source: 'scored' | 'estimate' } | null
  jobs: { title: string; company: string; dates: string; first_line: string | null }[]
  more_jobs: number
}

const MAX_JOBS = 4

export function resumeCard(
  resumeId: string,
  version: number,
  doc: ResumeDoc,
  forJob: string | null,
  fit: { overall: number; source: 'scored' | 'estimate' } | null,
): ResumeCard {
  const shown = visibleDoc(doc)
  return {
    kind: 'resume_card',
    resume_id: resumeId,
    version,
    name: shown.header.name,
    title: shown.header.title,
    for_job: forJob,
    fit,
    jobs: shown.experience.slice(0, MAX_JOBS).map((e) => ({
      title: e.title,
      company: e.company,
      dates: e.dates,
      first_line: e.bullets.find((b) => b.text.trim())?.text ?? null,
    })),
    more_jobs: Math.max(0, shown.experience.length - MAX_JOBS),
  }
}

/** Adds the card to a tool result without changing its text content. */
export function withCard(result: ToolResult, card: ResumeCard): ToolResult {
  return { ...result, structuredContent: card }
}

/** The card's HTML as an MCP Apps UI resource. No network access, so no CSP domains. */
export function registerResumeCard(server: McpServer) {
  registerAppResource(
    server,
    'ModuleHire resume preview',
    RESUME_CARD_URI,
    { description: 'Read-only preview of a ModuleHire resume with download and open-in-editor buttons.' },
    async () => ({
      contents: [{ uri: RESUME_CARD_URI, mimeType: RESOURCE_MIME_TYPE, text: RESUME_CARD_HTML, _meta: { ui: { prefersBorder: false } } }],
    }),
  )
}
