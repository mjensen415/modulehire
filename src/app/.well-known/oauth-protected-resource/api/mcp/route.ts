// RFC 9728 Protected Resource Metadata for the MCP endpoint. MCP clients (Claude, ChatGPT, ...)
// read this after a 401 from /api/mcp to find the authorization server: Supabase Auth's
// OAuth 2.1 server for this project.
import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from 'mcp-handler'
import { AUTH_SERVER_URL } from '@/lib/mcp/auth'

const handler = protectedResourceHandler({ authServerUrls: [AUTH_SERVER_URL] })
const options = metadataCorsOptionsRequestHandler()

export { handler as GET, options as OPTIONS }
