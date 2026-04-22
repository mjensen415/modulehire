import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

type Message = { role: 'user' | 'assistant' | 'system'; content: string }

/**
 * Unified AI completion function.
 * Reads AI_PROVIDER env var: 'claude' (default) | 'ollama'
 * For ollama: uses openai package pointed at OLLAMA_BASE_URL with model OLLAMA_MODEL
 */
export async function aiComplete(messages: Message[], maxTokens = 2048): Promise<string> {
  const provider = process.env.AI_PROVIDER ?? 'claude'

  if (provider === 'ollama') {
    const client = new OpenAI({
      baseURL: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1',
      apiKey: 'ollama', // required by OpenAI SDK but unused by Ollama
    })
    const model = process.env.OLLAMA_MODEL ?? 'llama3.1'
    const res = await client.chat.completions.create({
      model,
      messages,
      max_tokens: maxTokens,
    })
    return res.choices[0].message.content ?? ''
  }

  // Default: Claude API
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const res = await client.messages.create({
    model: 'claude-sonnet-4-6',
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
