import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const treeId = getRouterParam(event, 'id')

  // Verify ownership
  const tree = await prisma.tree.findFirst({
    where: { id: treeId, userId: session.user.id },
  })
  if (!tree) {
    throw createError({ statusCode: 404, message: 'Tree not found' })
  }

  if (event.method === 'GET') {
    const files = await prisma.projectFile.findMany({
      where: { treeId: treeId! },
      orderBy: { createdAt: 'asc' },
    })
    return files
  }

  if (event.method === 'POST') {
    const { name, content } = await readBody(event)
    if (!name || typeof name !== 'string') {
      throw createError({ statusCode: 400, message: 'File name required' })
    }
    if (typeof content !== 'string') {
      throw createError({ statusCode: 400, message: 'File content required' })
    }
    const file = await prisma.projectFile.create({
      data: { treeId: treeId!, name: name.trim(), content },
    })
    return file
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' })
})
