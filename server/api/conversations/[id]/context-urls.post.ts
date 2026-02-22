import { prisma } from '~/server/utils/prisma'
import { fetchUrlContent } from '~/server/services/urlFetch'

export interface ContextUrl {
  url: string
  content: string
  scrapedAt: string
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const id = getRouterParam(event, 'id')
  const { url } = await readBody(event)

  if (!url || typeof url !== 'string') {
    throw createError({ statusCode: 400, message: 'url is required' })
  }

  try { new URL(url) } catch {
    throw createError({ statusCode: 400, message: 'Invalid URL' })
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id },
    include: { tree: true },
  })
  if (!conversation || conversation.tree.userId !== session.user.id) {
    throw createError({ statusCode: 404, message: 'Conversation not found' })
  }

  const settings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
  })
  const followSameDomain = settings?.urlFetchSameDomain === true

  const content = await fetchUrlContent(url, followSameDomain)
  if (!content) {
    throw createError({ statusCode: 422, message: 'Could not fetch content from URL' })
  }

  const existing: ContextUrl[] = JSON.parse(conversation.contextUrls || '[]')
  // Replace if URL already exists, otherwise append
  const filtered = existing.filter((u) => u.url !== url)
  const updated: ContextUrl[] = [...filtered, { url, content, scrapedAt: new Date().toISOString() }]

  await prisma.conversation.update({
    where: { id },
    data: { contextUrls: JSON.stringify(updated) },
  })

  return { url, scrapedAt: updated[updated.length - 1].scrapedAt, contentLength: content.length }
})
