import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const userId = session.user.id
  const { treeId } = getQuery(event) as { treeId?: string }

  const messages = await prisma.message.findMany({
    where: {
      role: 'assistant',
      conversation: {
        deletedAt: null,
        tree: {
          userId,
          deletedAt: null,
          ...(treeId ? { id: treeId } : {}),
        },
      },
    },
    include: {
      conversation: {
        select: {
          id: true,
          title: true,
          model: true,
          treeId: true,
          tree: { select: { id: true, title: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })

  return messages.map((m) => ({
    id: m.id,
    createdAt: m.createdAt,
    content: m.content,
    inputTokens: m.inputTokens,
    outputTokens: m.outputTokens,
    model: m.conversation.model,
    conversationId: m.conversation.id,
    conversationTitle: m.conversation.title,
    treeId: m.conversation.treeId,
    treeTitle: m.conversation.tree.title,
  }))
})
