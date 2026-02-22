import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const {
    systemPrompt,
    enabledModels,
    defaultConvModel,
    defaultConvVerbosity,
    defaultBranchModel,
    defaultBranchVerbosity,
    streamingEnabled,
    localExecutionEnabled,
    urlFetchSameDomain,
    homeLayout,
  } = await readBody(event)

  const updateData: Record<string, any> = {}
  if (systemPrompt !== undefined) updateData.systemPrompt = systemPrompt ?? ''
  if (enabledModels !== undefined) updateData.enabledModels = JSON.stringify(enabledModels ?? [])
  if (defaultConvModel !== undefined) updateData.defaultConvModel = defaultConvModel
  if (defaultConvVerbosity !== undefined) updateData.defaultConvVerbosity = defaultConvVerbosity
  if (defaultBranchModel !== undefined) updateData.defaultBranchModel = defaultBranchModel
  if (defaultBranchVerbosity !== undefined) updateData.defaultBranchVerbosity = defaultBranchVerbosity
  if (streamingEnabled !== undefined) updateData.streamingEnabled = streamingEnabled
  if (localExecutionEnabled !== undefined) updateData.localExecutionEnabled = localExecutionEnabled
  if (urlFetchSameDomain !== undefined) updateData.urlFetchSameDomain = urlFetchSameDomain
  if (homeLayout !== undefined) updateData.homeLayout = homeLayout

  const settings = await prisma.userSettings.upsert({
    where: { userId: session.user.id },
    update: updateData,
    create: { userId: session.user.id, systemPrompt: '', enabledModels: '[]', ...updateData },
  })

  return {
    ...settings,
    enabledModels: JSON.parse(settings.enabledModels || '[]'),
  }
})
