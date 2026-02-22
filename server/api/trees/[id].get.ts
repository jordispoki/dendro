import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const id = getRouterParam(event, 'id')

  const tree = await prisma.tree.findFirst({
    where: { id, userId: session.user.id },
    include: {
      conversations: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!tree) {
    throw createError({ statusCode: 404, message: 'Tree not found' })
  }

  return tree
})
