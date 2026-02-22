import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  const settings = await prisma.userSettings.upsert({
    where: { userId: session.user.id },
    update: {},
    create: { userId: session.user.id, systemPrompt: '', enabledModels: '[]' },
  })

  return {
    ...settings,
    enabledModels: JSON.parse(settings.enabledModels || '[]'),
  }
})
