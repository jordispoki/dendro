import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const userId = session.user.id
  const query = getQuery(event) as { treeId?: string; limit?: string; before?: string }

  const limit = Math.min(Number(query.limit) || 50, 200)
  const before = query.before as string | undefined

  const messages = await prisma.message.findMany({
    where: {
      role: 'assistant',
      ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      conversation: {
        deletedAt: null,
        tree: {
          userId,
          deletedAt: null,
          ...(query.treeId ? { id: query.treeId } : {}),
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
    take: limit + 1,
  })

  const hasMore = messages.length > limit
  const entries = messages.slice(0, limit).map((m) => ({
    id: m.id,
    createdAt: m.createdAt.toISOString(),
    content: m.content,
    inputTokens: m.inputTokens,
    outputTokens: m.outputTokens,
    model: m.conversation.model,
    conversationId: m.conversation.id,
    conversationTitle: m.conversation.title,
    treeId: m.conversation.treeId,
    treeTitle: m.conversation.tree.title,
  }))

  return { entries, hasMore }
})
