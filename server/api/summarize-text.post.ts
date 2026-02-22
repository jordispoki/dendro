import { getLLMProvider } from '~/server/services/llm/index'
import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const { text } = await readBody(event)

  if (!text || typeof text !== 'string') {
    throw createError({ statusCode: 400, message: 'text required' })
  }

  // Use the model from the user's most recently active conversation, falling back to default
  const lastConv = await prisma.conversation.findFirst({
    where: { tree: { userId: session.user.id }, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { model: true },
  })
  const model = lastConv?.model

  const llm = getLLMProvider(model)

  const messages = [
    {
      role: 'user',
      content: `Summarize the following text concisely in 1-3 sentences:\n\n${text.slice(0, 4000)}`,
    },
  ]

  let summary = ''
  try {
    await llm.streamChat(messages, (chunk) => { summary += chunk }, model)
  } catch (err: any) {
    throw createError({ statusCode: 500, message: 'LLM error: ' + err?.message })
  }

  return { summary: summary.trim() }
})
