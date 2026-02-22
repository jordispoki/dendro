import { GeminiProvider } from './gemini'
import { OpenRouterProvider } from './openrouter'

export interface ChatMessage {
  role: string
  content: string
}

export interface LLMProvider {
  streamChat(
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    model?: string
  ): Promise<void>

  summarize(messages: ChatMessage[], model?: string): Promise<string>
}

export function getLLMProvider(model?: string): LLMProvider {
  if (model?.startsWith('openrouter/')) {
    return new OpenRouterProvider()
  }
  return new GeminiProvider()
}
