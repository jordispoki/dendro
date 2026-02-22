import { prisma } from '~/server/utils/prisma'
import { getLLMProvider } from '~/server/services/llm/index'
import { buildContext } from '~/server/services/context'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const id = getRouterParam(event, 'id')
  const { content } = await readBody(event)

  if (!content || typeof content !== 'string') {
    throw createError({ statusCode: 400, message: 'Message content required' })
  }

  // Verify ownership
  const conversation = await prisma.conversation.findFirst({
    where: { id },
    include: { tree: true },
  })
  if (!conversation || conversation.tree.userId !== session.user.id) {
    throw createError({ statusCode: 404, message: 'Conversation not found' })
  }

  // Save user message
  await prisma.message.create({
    data: { conversationId: id!, role: 'user', content },
  })

  // Get user settings
  const settings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
  })
  const systemPrompt = settings?.systemPrompt || ''

  // Build context for LLM
  const messages = await buildContext(id!, systemPrompt, conversation.verbosity)

  // Set up SSE
  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  const llm = getLLMProvider(conversation.model)
  let fullResponse = ''

  try {
    await llm.streamChat(
      messages,
      (chunk) => {
        fullResponse += chunk
        event.node.res.write(`data: ${JSON.stringify({ chunk })}\n\n`)
      },
      conversation.model
    )

    // Save assistant message
    await prisma.message.create({
      data: { conversationId: id!, role: 'assistant', content: fullResponse },
    })

    event.node.res.write(`data: ${JSON.stringify({ done: true })}\n\n`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('LLM streaming error:', msg)
    event.node.res.write(`data: ${JSON.stringify({ error: 'LLM error occurred' })}\n\n`)
  }

  event.node.res.end()
})
