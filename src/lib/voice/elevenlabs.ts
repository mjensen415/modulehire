// Server-only ElevenLabs Agents API helpers. The API key never leaves the server; the browser
// only ever gets a signed URL, which expires 15 minutes after it is issued.
const API = 'https://api.elevenlabs.io/v1'

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set')
  return key
}

export function voiceConfigured(): boolean {
  return !!process.env.ELEVENLABS_API_KEY && !!process.env.ELEVENLABS_AGENT_ID
}

// Kill switch: set VOICE_INTERVIEWS_ENABLED=false in Vercel to stop new sessions immediately.
export function voiceEnabled(): boolean {
  return voiceConfigured() && process.env.VOICE_INTERVIEWS_ENABLED !== 'false'
}

async function el<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'xi-api-key': apiKey(), 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`ElevenLabs ${init?.method ?? 'GET'} ${path} failed: ${res.status} ${body.slice(0, 500)}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export async function getSignedUrl(): Promise<string> {
  const agentId = process.env.ELEVENLABS_AGENT_ID
  if (!agentId) throw new Error('ELEVENLABS_AGENT_ID is not set')
  const data = await el<{ signed_url: string }>(
    `/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
  )
  return data.signed_url
}

export type ElTranscriptTurn = { role: 'user' | 'agent'; message?: string | null; time_in_call_secs: number }

export type ElConversation = {
  conversation_id: string
  agent_id: string
  status: 'initiated' | 'in-progress' | 'processing' | 'done' | 'failed'
  transcript: ElTranscriptTurn[]
  metadata: { call_duration_secs: number; start_time_unix_secs: number }
}

export async function getConversation(conversationId: string): Promise<ElConversation> {
  return el<ElConversation>(`/convai/conversations/${encodeURIComponent(conversationId)}`)
}

// Polls until ElevenLabs finishes processing the call (usually a few seconds after hang-up).
export async function waitForConversation(conversationId: string, timeoutMs = 45_000): Promise<ElConversation> {
  const started = Date.now()
  let last: ElConversation | null = null
  while (Date.now() - started < timeoutMs) {
    last = await getConversation(conversationId)
    if (last.status === 'done' || last.status === 'failed') return last
    await new Promise((r) => setTimeout(r, 2500))
  }
  if (last) return last
  throw new Error('Conversation not ready')
}

export async function deleteConversation(conversationId: string): Promise<void> {
  await el<void>(`/convai/conversations/${encodeURIComponent(conversationId)}`, { method: 'DELETE' })
}

export async function createAgent(body: Record<string, unknown>): Promise<string> {
  const data = await el<{ agent_id: string }>(`/convai/agents/create`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return data.agent_id
}
