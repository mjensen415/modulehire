import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validate'

// AI apps (OAuth clients such as Claude or ChatGPT) the user has allowed to use their account
// through the MCP server, from Supabase Auth's OAuth 2.1 server. Revoking a grant also ends that
// app's sessions, so its tokens stop working at the next tool call (/api/mcp checks each token
// with auth.getUser).

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase.auth.oauth.listGrants()
  // While the OAuth server is off there is nothing to list; show the empty state, not an error.
  if (error) {
    console.error('[connected-apps GET]', error.message)
    return NextResponse.json({ apps: [] })
  }
  return NextResponse.json({
    apps: (data ?? []).map((g) => ({
      client_id: g.client.id,
      name: g.client.name?.trim() || 'Unnamed app',
      uri: g.client.uri ?? null,
      logo_uri: g.client.logo_uri ?? null,
      granted_at: g.granted_at,
    })),
  })
}

export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const clientId = new URL(req.url).searchParams.get('client_id')
  if (!isUuid(clientId)) return NextResponse.json({ error: 'Invalid client_id' }, { status: 400 })

  const { error } = await supabase.auth.oauth.revokeGrant({ clientId })
  if (error) {
    console.error('[connected-apps DELETE]', error.message)
    return NextResponse.json({ error: 'Could not disconnect that app. Try again.' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
