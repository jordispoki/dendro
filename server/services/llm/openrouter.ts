import type { ChatMessage, LLMProvider, UsageMetadata } from './index'

const BASE_URL = 'https://openrouter.ai/api/v1'
const DEFAULT_MODEL = 'openai/gpt-4o-mini'

function modelName(model: string): string {
  return model.replace(/^openrouter\//, '')
}

function getHeaders(apiKey: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://chat-tree.app',
    'X-Title': 'Chat Tree',
  }
}

export class OpenRouterProvider implements LLMProvider {
  private getApiKey(): string {
    const config = useRuntimeConfig()
    const key = config.openrouterApiKey as string
    if (!key) throw new Error('OPENROUTER_API_KEY is not configured')
    return key
  }

  async streamChat(
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    model = DEFAULT_MODEL
  ): Promise<UsageMetadata> {
    const apiKey = this.getApiKey()

    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: getHeaders(apiKey),
      body: JSON.stringify({
        model: modelName(model),
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`OpenRouter ${response.status}: ${error.slice(0, 200)}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let buffer = ''
    let usageData = { prompt_tokens: 0, completion_tokens: 0 }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') break
        try {
          const parsed = JSON.parse(data)
          if (parsed.usage) usageData = parsed.usage
          const content = parsed.choices?.[0]?.delta?.content
          if (content) onChunk(content)
        } catch {
          // ignore malformed SSE chunks
        }
      }
    }

    return { inputTokens: usageData.prompt_tokens, outputTokens: usageData.completion_tokens }
  }

  async summarize(messages: ChatMessage[], model = DEFAULT_MODEL): Promise<string> {
    const apiKey = this.getApiKey()

    const conversation = messages
      .filter((m) => m.role !== 'system')
      .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`)
      .join('\n\n')

    const prompt = `Summarize the following conversation in 2-4 concise sentences, capturing the main topic and key insights. Be specific enough that someone could continue the conversation intelligently.\n\n${conversation}`

    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: getHeaders(apiKey),
      body: JSON.stringify({
        model: modelName(model),
        messages: [{ role: 'user', content: prompt }],
        stream: false,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`OpenRouter ${response.status}: ${error.slice(0, 200)}`)
    }

    const result = await response.json() as any
    return result.choices?.[0]?.message?.content || ''
  }
}
