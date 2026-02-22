import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const treeId = getRouterParam(event, 'id')
  const fileId = getRouterParam(event, 'fileId')

  // Verify ownership via joined query
  const file = await prisma.projectFile.findFirst({
    where: {
      id: fileId,
      treeId: treeId!,
      tree: { userId: session.user.id },
    },
  })

  if (!file) {
    throw createError({ statusCode: 404, message: 'File not found' })
  }

  await prisma.projectFile.delete({ where: { id: fileId! } })

  return { ok: true }
})
