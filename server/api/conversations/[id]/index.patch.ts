import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

  // Verify ownership through tree
  const conversation = await prisma.conversation.findFirst({
    where: { id },
    include: { tree: true },
  })
  if (!conversation || conversation.tree.userId !== session.user.id) {
    throw createError({ statusCode: 404, message: 'Conversation not found' })
  }

  const updateData: Record<string, unknown> = {}
  if (body.title !== undefined) updateData.title = body.title
  if (body.model !== undefined) updateData.model = body.model
  if (body.verbosity !== undefined) updateData.verbosity = body.verbosity
  if (body.closedAt !== undefined) updateData.closedAt = body.closedAt ? new Date(body.closedAt) : null
  if (body.deletedAt !== undefined) updateData.deletedAt = body.deletedAt ? new Date(body.deletedAt) : null

  const updated = await prisma.conversation.update({
    where: { id },
    data: updateData,
  })

  return updated
})
