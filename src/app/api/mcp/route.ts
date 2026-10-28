// ModuleHire MCP server (classic). Streamable HTTP, stateless, served by mcp-handler.
// Every request needs a Supabase access token as a bearer token; without one the client gets a
// 401 pointing at /.well-known/oauth-protected-resource/api/mcp, which names Supabase Auth as the
// authorization server. Tools live in src/lib/mcp/tools.ts.
import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import { registerClassicTools } from '@/lib/mcp/tools'
import { verifyToken } from '@/lib/mcp/auth'

export const maxDuration = 60

const handler = createMcpHandler(
  (server) => {
    registerClassicTools(server)
  },
  {
    serverInfo: { name: 'modulehire', version: '0.1.0' },
    instructions:
      "ModuleHire holds the user's career library: skill modules (fact-checked accomplishment blocks), target jobs with weighted requirements, and live tailored resumes. Use these tools for the user's real data. Only state facts a module supports; never invent metrics, employers, or titles. Point the user to the returned URLs when they want to edit on modulehire.com.",
  },
)

const authed = withMcpAuth(handler, verifyToken, {
  required: true,
  resourceMetadataPath: '/.well-known/oauth-protected-resource/api/mcp',
})

export { authed as GET, authed as POST, authed as DELETE }
