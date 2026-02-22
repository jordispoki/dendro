import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const id = getRouterParam(event, 'id')

  const conversation = await prisma.conversation.findFirst({
    where: { id },
    include: {
      tree: true,
      messages: { orderBy: { createdAt: 'asc' } },
    },
  })

  if (!conversation || conversation.tree.userId !== session.user.id) {
    throw createError({ statusCode: 404, message: 'Conversation not found' })
  }

  return conversation.messages.map((msg) => ({
    ...msg,
    attachments: JSON.parse(msg.attachments || '[]'),
    fetchedUrls: JSON.parse(msg.fetchedUrls || '[]'),
  }))
})
