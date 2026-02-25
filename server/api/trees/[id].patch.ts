import { prisma } from '~/server/utils/prisma'
import { logActivity } from '~/server/utils/activityLogger'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

  const tree = await prisma.tree.findFirst({
    where: { id, userId: session.user.id },
  })
  if (!tree) throw createError({ statusCode: 404, message: 'Tree not found' })

  const updated = await prisma.tree.update({
    where: { id },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.deletedAt !== undefined ? { deletedAt: new Date(body.deletedAt) } : {}),
      ...(body.pinnedAt !== undefined ? { pinnedAt: body.pinnedAt ? new Date(body.pinnedAt) : null } : {}),
    },
  })

  if (body.title !== undefined && body.title !== tree.title) {
    logActivity(session.user.id, 'tree.renamed', { treeId: id, from: tree.title, to: body.title })
  } else if (body.deletedAt !== undefined) {
    logActivity(session.user.id, 'tree.deleted', { treeId: id, title: tree.title, hard: false })
  }
  return updated
})
