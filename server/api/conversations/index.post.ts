import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const body = await readBody(event)
  const { treeId, parentId, title, model, verbosity, branchText, branchMessageId, branchSummary } = body

  if (!treeId || !title) {
    throw createError({ statusCode: 400, message: 'treeId and title required' })
  }

  // Verify tree ownership
  const tree = await prisma.tree.findFirst({
    where: { id: treeId, userId: session.user.id },
  })
  if (!tree) throw createError({ statusCode: 404, message: 'Tree not found' })

  const conversation = await prisma.conversation.create({
    data: {
      treeId,
      parentId: parentId || null,
      title,
      model: model || 'openrouter/deepseek/deepseek-chat-v3-0324',
      verbosity: verbosity || 'normal',
      branchText: branchText || null,
      branchMessageId: branchMessageId || null,
      branchSummary: branchSummary || null,
    },
  })

  return conversation
})
