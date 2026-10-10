import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { jsonrepair } from 'jsonrepair'

// A content block lets a caller mark part of a prompt as a stable, reusable prefix.
// `cache: true` becomes an Anthropic `cache_control: { type: 'ephemeral' }` breakpoint —
// ignored (flattened to plain text) on the ollama provider, which has no such concept.
type ContentBlock = { text: string; cache?: boolean }
type Message = { role: 'user' | 'assistant' | 'system'; content: string | ContentBlock[] }

export type ModelTier = 'fast' | 'quality'

type AiOpts = {
  model?: string
  tier?: ModelTier
  /** When set together with `action`, usage is logged fire-and-forget to usage_events.metadata. */
  userId?: string
  action?: string
}

function flattenContent(content: string | ContentBlock[]): string {
  return typeof content === 'string' ? content : content.map(b => b.text).join('')
}

const HAIKU = 'claude-haiku-4-5-20251001'

/**
 * Haiku first. Every call runs on Haiku unless its `action` is listed in the
 * SONNET_FEATURES env var (comma-separated, e.g. "generate_resume,match_report",
 * or "all"). Unset/empty = everything on Haiku. The Sonnet model id comes from
 * ANTHROPIC_MODEL_QUALITY. `tier: 'quality'` marks calls that are *eligible* for
 * Sonnet; it no longer gets Sonnet by itself.
 */
function sonnetFeatures(): Set<string> {
  return new Set((process.env.SONNET_FEATURES ?? '').split(',').map(s => s.trim()).filter(Boolean))
}

export function resolveModel(tier: ModelTier | 'default' = 'default', action?: string): string {
  const haiku = process.env.ANTHROPIC_MODEL_FAST || process.env.ANTHROPIC_MODEL || HAIKU
  if (tier === 'quality') {
    const on = sonnetFeatures()
    if (on.has('all') || (action && on.has(action))) {
      return process.env.ANTHROPIC_MODEL_QUALITY || 'claude-sonnet-5'
    }
  }
  return haiku
}

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Fire-and-forget — a logging failure must never fail the AI call that triggered it.
function logUsage(opts: AiOpts | undefined, model: string, usage: { input_tokens: number; output_tokens: number; duration_ms: number }) {
  if (!opts?.userId || !opts?.action) return
  getAdminClient()
    .from('usage_events')
    .insert({ user_id: opts.userId, action: opts.action, metadata: { model, input_tokens: usage.input_tokens, output_tokens: usage.output_tokens, duration_ms: usage.duration_ms } })
    .then(({ error }) => { if (error) console.error('[ai] usage log failed:', error) })
}

function buildOllamaClient() {
  return new OpenAI({
    baseURL: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1',
    apiKey: 'ollama',
  })
}

/**
 * Unified AI completion function.
 * Reads AI_PROVIDER env var: 'claude' (default) | 'ollama'
 * For ollama: uses openai package pointed at OLLAMA_BASE_URL with model OLLAMA_MODEL
 */
export async function aiComplete(messages: Message[], maxTokens = 4096, opts?: AiOpts): Promise<string> {
  const provider = process.env.AI_PROVIDER ?? 'claude'

  if (provider === 'ollama') {
    const client = buildOllamaClient()
    const model = process.env.OLLAMA_MODEL ?? 'llama3.1'

    const timeoutMs = 90_000
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const res = await client.chat.completions.create(
        {
          model,
          messages: messages.map(m => ({ role: m.role, content: flattenContent(m.content) })),
          max_tokens: maxTokens,
        },
        { signal: controller.signal }
      )
      return res.choices[0].message.content ?? ''
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new Error('AI parse timed out — try again')
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  // Default: Claude API
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const model = opts?.model || resolveModel(opts?.tier ?? 'default', opts?.action)
  const systemMessage = messages.find(m => m.role === 'system')
  const startedAt = Date.now()
  const res = await client.messages.create({
    model,
    max_tokens: maxTokens,
    messages: messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role as 'user' | 'assistant',
      content: typeof m.content === 'string'
        ? m.content
        : m.content.map(b => ({
            type: 'text' as const,
            text: b.text,
            ...(b.cache ? { cache_control: { type: 'ephemeral' as const } } : {}),
          })),
    })),
    ...(systemMessage ? { system: flattenContent(systemMessage.content) } : {}),
  })
  const durationMs = Date.now() - startedAt

  // Sonnet with extended thinking can return a `thinking` block before the `text`
  // block — find the text block explicitly rather than assuming content[0].
  const textBlock = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  if (!textBlock) throw new Error('AI response contained no text block')

  logUsage(opts, model, { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens, duration_ms: durationMs })
  return textBlock.text
}

/**
 * Structured-output completion via forced tool use — returns the tool's typed input
 * directly, skipping brace-slicing/comment-stripping and the "model did not return
 * JSON" failure mode. On the ollama provider (no native tool-use guarantee here),
 * falls back to a plain completion repaired with jsonrepair.
 */
export async function aiCompleteJson<T>(
  messages: Message[],
  schema: Record<string, unknown>,
  maxTokens = 4096,
  opts?: AiOpts
): Promise<T> {
  const provider = process.env.AI_PROVIDER ?? 'claude'

  if (provider === 'ollama') {
    const text = await aiComplete(messages, maxTokens, opts)
    return JSON.parse(jsonrepair(text)) as T
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const model = opts?.model || resolveModel(opts?.tier ?? 'default', opts?.action)
  const systemMessage = messages.find(m => m.role === 'system')
  const toolName = 'emit_result'

  const startedAt = Date.now()
  const res = await client.messages.create({
    model,
    max_tokens: maxTokens,
    tools: [{ name: toolName, description: 'Emit the structured result for this request.', input_schema: schema as Anthropic.Tool.InputSchema }],
    tool_choice: { type: 'tool', name: toolName },
    messages: messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role as 'user' | 'assistant',
      content: typeof m.content === 'string'
        ? m.content
        : m.content.map(b => ({
            type: 'text' as const,
            text: b.text,
            ...(b.cache ? { cache_control: { type: 'ephemeral' as const } } : {}),
          })),
    })),
    ...(systemMessage ? { system: flattenContent(systemMessage.content) } : {}),
  })
  const durationMs = Date.now() - startedAt

  const toolUse = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === toolName)
  if (!toolUse) throw new Error('AI did not return structured output')

  logUsage(opts, model, { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens, duration_ms: durationMs })
  return toolUse.input as T
}
