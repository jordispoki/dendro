import { prisma } from '~/server/utils/prisma'

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
    },
  })

  return updated
})
