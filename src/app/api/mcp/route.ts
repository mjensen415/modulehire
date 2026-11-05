// ModuleHire MCP server (classic). Streamable HTTP, stateless, served by mcp-handler.
// Every request needs a Supabase access token as a bearer token; without one the client gets a
// 401 pointing at /.well-known/oauth-protected-resource/api/mcp, which names Supabase Auth as the
// authorization server. Read tools live in src/lib/mcp/tools.ts, write tools in
// src/lib/mcp/write-tools.ts.
import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import { registerClassicTools } from '@/lib/mcp/tools'
import { registerWriteTools } from '@/lib/mcp/write-tools'
import { registerResumeCard } from '@/lib/mcp/card'
import { verifyToken } from '@/lib/mcp/auth'

// generate_resume runs the whole /api/jobs/start pipeline in this request (usually 20 to 40s).
export const maxDuration = 300

const handler = createMcpHandler(
  (server) => {
    registerClassicTools(server)
    registerWriteTools(server)
    registerResumeCard(server)
  },
  {
    serverInfo: { name: 'modulehire', version: '0.3.0' },
    // Stateless and nothing to push: an accepted subscriptions/listen stream (protocol 2026-07-28)
    // stays open until the 300s function limit kills it.
    maxSubscriptions: 0,
    instructions:
      "ModuleHire holds the user's career library: skill modules (fact-checked accomplishment blocks), target jobs with weighted requirements, and live tailored resumes. Use these tools for the user's real data. Only state facts a module supports; never invent metrics, employers, or titles. When the user mentions an accomplishment that isn't in their library, offer to save it with add_module. Edit resumes with get_resume first, then update_block, reorder_blocks, or set_section_visibility using the version it returned. Confirm before generate_resume, since it counts toward the user's monthly limit. Use get_editor_link when the user wants to open a resume on modulehire.com.",
  },
)

const authed = withMcpAuth(handler, verifyToken, {
  required: true,
  resourceMetadataPath: '/.well-known/oauth-protected-resource/api/mcp',
})

export { authed as GET, authed as POST, authed as DELETE }
