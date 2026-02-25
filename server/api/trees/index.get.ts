import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const trees = await prisma.tree.findMany({
    where: { userId: session.user.id, deletedAt: null },
    orderBy: [
      { pinnedAt: { sort: 'desc', nulls: 'last' } },
      { createdAt: 'desc' },
    ],
    include: {
      conversations: {
        where: { deletedAt: null },
        select: { id: true },
      },
    },
  })
  return trees
})
