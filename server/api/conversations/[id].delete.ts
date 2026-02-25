import { prisma } from '~/server/utils/prisma'
import { logActivity } from '~/server/utils/activityLogger'

/** Recursively collect all descendant conversation IDs (depth-first, children before parent). */
async function collectDescendants(id: string): Promise<string[]> {
  const children = await prisma.conversation.findMany({
    where: { parentId: id },
    select: { id: true },
  })
  const ids: string[] = []
  for (const c of children) {
    const nested = await collectDescendants(c.id)
    ids.push(...nested, c.id)
  }
  return ids
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const id = getRouterParam(event, 'id')

  const conversation = await prisma.conversation.findFirst({
    where: { id },
    include: { tree: true },
  })
  if (!conversation || conversation.tree.userId !== session.user.id) {
    throw createError({ statusCode: 404, message: 'Conversation not found' })
  }

  // Collect descendants (deepest first) so FK constraints don't block deletion
  const descendantIds = await collectDescendants(id!)
  const allIds = [...descendantIds, id!]

  // Delete messages first (though cascade handles it — explicit for safety)
  await prisma.message.deleteMany({ where: { conversationId: { in: allIds } } })

  // Delete conversations deepest-first
  for (const cid of allIds) {
    await prisma.conversation.delete({ where: { id: cid } })
  }

  logActivity(session.user.id, 'conversation.deleted', {
    conversationId: id,
    conversationTitle: conversation.title,
    treeId: conversation.treeId,
    treeTitle: conversation.tree.title,
    title: conversation.title,
  })
  return { ok: true }
})
