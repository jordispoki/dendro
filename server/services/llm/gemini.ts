import { GoogleGenerativeAI } from '@google/generative-ai'
import type { ChatMessage, LLMProvider } from './index'

const DEFAULT_MODEL = 'gemini-2.0-flash-lite'

function modelName(model: string): string {
  // Strip provider prefix if present: "google/gemini-2.0-flash-lite" → "gemini-2.0-flash-lite"
  return model.replace(/^google\//, '')
}

export class GeminiProvider implements LLMProvider {
  private getClient() {
    const config = useRuntimeConfig()
    const apiKey = config.geminiApiKey
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured')
    return new GoogleGenerativeAI(apiKey)
  }

  async streamChat(
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    model = DEFAULT_MODEL
  ): Promise<void> {
    const client = this.getClient()
    const genModel = client.getGenerativeModel({ model: modelName(model) })

    // Separate system messages
    const systemMessages = messages.filter((m) => m.role === 'system')
    const chatMessages = messages.filter((m) => m.role !== 'system')

    const systemInstruction = systemMessages.map((m) => m.content).join('\n\n') || undefined

    // Build history (all but last message)
    const history = chatMessages.slice(0, -1).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

    const lastMessage = chatMessages[chatMessages.length - 1]
    if (!lastMessage) throw new Error('No messages to send')

    const chat = genModel.startChat({
      history,
      systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
    })

    const result = await chat.sendMessageStream(lastMessage.content)
    for await (const chunk of result.stream) {
      const text = chunk.text()
      if (text) onChunk(text)
    }
  }

  async summarize(messages: ChatMessage[], model = DEFAULT_MODEL): Promise<string> {
    const client = this.getClient()
    const genModel = client.getGenerativeModel({ model: modelName(model) })

    const conversation = messages
      .filter((m) => m.role !== 'system')
      .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`)
      .join('\n\n')

    const prompt = `Summarize the following conversation in 2-4 concise sentences, capturing the main topic and key insights. Be specific enough that someone could continue the conversation intelligently.\n\n${conversation}`

    const result = await genModel.generateContent(prompt)
    return result.response.text()
  }
}
