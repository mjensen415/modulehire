import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { createAgent, voiceConfigured, voiceEnabled } from '@/lib/voice/elevenlabs'
import { agentDefinition } from '@/lib/voice/interview'

// GET — setup status for /admin/voice.
export async function GET() {
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error
  return NextResponse.json({
    has_api_key: !!process.env.ELEVENLABS_API_KEY,
    agent_id: process.env.ELEVENLABS_AGENT_ID ?? null,
    configured: voiceConfigured(),
    enabled: voiceEnabled(),
  })
}

// POST — creates the interviewer agent on ElevenLabs with the server's API key and returns its
// id. Add it to Vercel as ELEVENLABS_AGENT_ID and redeploy. Run once; running again makes a
// second agent.
export async function POST() {
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error
  if (!process.env.ELEVENLABS_API_KEY) {
    return NextResponse.json({ error: 'Set ELEVENLABS_API_KEY in Vercel first.' }, { status: 400 })
  }
  try {
    const agentId = await createAgent(agentDefinition())
    return NextResponse.json({ agent_id: agentId })
  } catch (e) {
    console.error('[admin/voice POST]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Agent creation failed' }, { status: 500 })
  }
}
