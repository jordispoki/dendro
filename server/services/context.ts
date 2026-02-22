import { prisma } from '~/server/utils/prisma'
import type { ChatMessage } from './llm/index'

const VERBOSITY_INSTRUCTIONS: Record<string, string> = {
  concise: 'Be concise. Keep responses short and direct — no unnecessary elaboration.',
  normal: '',
  detailed: 'Be thorough. Provide detailed explanations with context and examples where helpful.',
}

export async function buildContext(
  conversationId: string,
  systemPrompt: string,
  verbosity = 'normal'
): Promise<ChatMessage[]> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })

  if (!conversation) throw new Error('Conversation not found')

  const messages: ChatMessage[] = []

  // Add system prompt if present
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt })
  }

  // Inject verbosity instruction
  const verbosityInstruction = VERBOSITY_INSTRUCTIONS[verbosity]
  if (verbosityInstruction) {
    messages.push({ role: 'system', content: verbosityInstruction })
  }

  if (conversation.parentId) {
    // Branch conversation: use stored summary + selected text as context
    if (conversation.branchSummary) {
      messages.push({
        role: 'system',
        content: `Context from parent conversation:\n${conversation.branchSummary}`,
      })
    }
    if (conversation.branchText) {
      messages.push({
        role: 'user',
        content: `I want to explore this part specifically: "${conversation.branchText}"`,
      })
      messages.push({
        role: 'assistant',
        content: `I'll help you explore that. What would you like to know?`,
      })
    }
  }

  // Add own messages
  for (const msg of conversation.messages) {
    messages.push({ role: msg.role, content: msg.content })
  }

  return messages
}
