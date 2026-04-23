import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

type Message = { role: 'user' | 'assistant' | 'system'; content: string }

/**
 * Unified AI completion function.
 * Reads AI_PROVIDER env var: 'claude' (default) | 'ollama'
 * For ollama: uses openai package pointed at OLLAMA_BASE_URL with model OLLAMA_MODEL
 */
export async function aiComplete(messages: Message[], maxTokens = 4096): Promise<string> {
  const provider = process.env.AI_PROVIDER ?? 'claude'

  if (provider === 'ollama') {
    const client = new OpenAI({
      baseURL: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1',
      apiKey: 'ollama',
    })
    const model = process.env.OLLAMA_MODEL ?? 'llama3.1'

    const timeoutMs = 90_000
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const res = await client.chat.completions.create(
        { model, messages, max_tokens: maxTokens },
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
  const res = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
    max_tokens: maxTokens,
    messages: messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    ...(messages.find(m => m.role === 'system')
      ? { system: messages.find(m => m.role === 'system')!.content }
      : {}),
  })
  return (res.content[0] as { text: string }).text
}
