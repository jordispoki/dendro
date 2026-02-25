import { prisma } from './prisma'
import { logBus } from './logBus'

export function logActivity(
  userId: string,
  action: string,
  payload: Record<string, unknown> = {},
) {
  const treeId = (payload.treeId as string) || null
  const conversationId = (payload.conversationId as string) || null
  prisma.activityLog.create({
    data: { userId, action, payload: JSON.stringify(payload), treeId, conversationId },
  })
    .then((record) => {
      logBus.emit('activity', {
        userId,
        entry: {
          id: record.id,
          action: record.action,
          payload: JSON.parse(record.payload),
          treeId: record.treeId,
          conversationId: record.conversationId,
          createdAt: record.createdAt.toISOString(),
        },
      })
    })
    .catch(() => {})
}
