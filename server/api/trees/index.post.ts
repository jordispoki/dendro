import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const { title, model, verbosity } = await readBody(event)

  if (!title || typeof title !== 'string') {
    throw createError({ statusCode: 400, message: 'Title required' })
  }

  const tree = await prisma.tree.create({
    data: {
      userId: session.user.id,
      title,
      conversations: {
        create: {
          title,
          model: model || 'openrouter/deepseek/deepseek-chat-v3-0324',
          verbosity: verbosity || 'detailed',
        },
      },
    },
    include: {
      conversations: true,
    },
  })

  return tree
})
