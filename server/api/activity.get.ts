import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const query = getQuery(event)

  const limit = Math.min(Number(query.limit) || 50, 500)
  const actionFilter = (query.action as string) || ''
  const before = query.before as string | undefined
  const treeId = (query.treeId as string) || undefined
  const conversationId = (query.conversationId as string) || undefined

  const rows = await prisma.activityLog.findMany({
    where: {
      userId: session.user.id,
      ...(actionFilter ? { action: { startsWith: actionFilter } } : {}),
      ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      ...(treeId ? { treeId } : {}),
      ...(conversationId ? { conversationId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  })

  const hasMore = rows.length > limit
  const entries = rows.slice(0, limit).map((r) => ({
    id: r.id,
    action: r.action,
    payload: JSON.parse(r.payload || '{}'),
    treeId: r.treeId,
    conversationId: r.conversationId,
    createdAt: r.createdAt.toISOString(),
  }))

  return { entries, hasMore }
})
