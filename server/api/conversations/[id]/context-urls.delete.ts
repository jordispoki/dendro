import { prisma } from '~/server/utils/prisma'
import { logActivity } from '~/server/utils/activityLogger'
import type { ContextUrl } from './context-urls.post'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const id = getRouterParam(event, 'id')
  const { url } = await readBody(event)

  if (!url) throw createError({ statusCode: 400, message: 'url is required' })

  const conversation = await prisma.conversation.findFirst({
    where: { id },
    include: { tree: true },
  })
  if (!conversation || conversation.tree.userId !== session.user.id) {
    throw createError({ statusCode: 404, message: 'Conversation not found' })
  }

  const existing: ContextUrl[] = JSON.parse(conversation.contextUrls || '[]')
  const updated = existing.filter((u) => u.url !== url)

  await prisma.conversation.update({
    where: { id },
    data: { contextUrls: JSON.stringify(updated) },
  })

  logActivity(session.user.id, 'url.removed', {
    scope: 'conversation',
    conversationId: id,
    conversationTitle: conversation.title,
    treeId: conversation.treeId,
    treeTitle: conversation.tree.title,
    url,
  })

  return { ok: true }
})
