import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const id = getRouterParam(event, 'id')

  const tree = await prisma.tree.findFirst({
    where: { id, userId: session.user.id },
  })
  if (!tree) throw createError({ statusCode: 404, message: 'Tree not found' })

  // Cascade: messages → conversations → project files → tree
  const conversations = await prisma.conversation.findMany({
    where: { treeId: id! },
    select: { id: true },
  })
  const convIds = conversations.map((c) => c.id)

  await prisma.message.deleteMany({ where: { conversationId: { in: convIds } } })
  await prisma.conversation.deleteMany({ where: { treeId: id! } })
  await prisma.projectFile.deleteMany({ where: { treeId: id! } })
  await prisma.tree.delete({ where: { id } })

  return { ok: true }
})
