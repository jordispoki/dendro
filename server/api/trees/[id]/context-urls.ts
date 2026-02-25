import { prisma } from '~/server/utils/prisma'
import { fetchUrlContent } from '~/server/services/urlFetch'
import { logActivity } from '~/server/utils/activityLogger'

export interface TreeContextUrl {
  url: string
  content: string
  scrapedAt: string
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const id = getRouterParam(event, 'id')

  const tree = await prisma.tree.findFirst({
    where: { id, userId: session.user.id },
  })
  if (!tree) throw createError({ statusCode: 404, message: 'Tree not found' })

  const existing: TreeContextUrl[] = JSON.parse(tree.contextUrls || '[]')

  // POST — scrape and add URL
  if (event.method === 'POST') {
    const { url } = await readBody(event)
    if (!url || typeof url !== 'string') {
      throw createError({ statusCode: 400, message: 'url is required' })
    }
    try { new URL(url) } catch {
      throw createError({ statusCode: 400, message: 'Invalid URL' })
    }

    const settings = await prisma.userSettings.findUnique({ where: { userId: session.user.id } })
    const followSameDomain = settings?.urlFetchSameDomain === true

    const content = await fetchUrlContent(url, followSameDomain)
    if (!content) throw createError({ statusCode: 422, message: 'Could not fetch content from URL' })

    const scrapedAt = new Date().toISOString()
    const updated: TreeContextUrl[] = [
      ...existing.filter((u) => u.url !== url),
      { url, content, scrapedAt },
    ]
    await prisma.tree.update({ where: { id }, data: { contextUrls: JSON.stringify(updated) } })
    logActivity(session.user.id, 'url.scraped', {
      scope: 'tree',
      treeId: id,
      treeTitle: tree.title,
      url,
      contentLength: content.length,
    })
    return { url, scrapedAt, contentLength: content.length }
  }

  // DELETE — remove URL
  if (event.method === 'DELETE') {
    const { url } = await readBody(event)
    if (!url) throw createError({ statusCode: 400, message: 'url is required' })
    const updated = existing.filter((u) => u.url !== url)
    await prisma.tree.update({ where: { id }, data: { contextUrls: JSON.stringify(updated) } })
    logActivity(session.user.id, 'url.removed', {
      scope: 'tree',
      treeId: id,
      treeTitle: tree.title,
      url,
    })
    return { ok: true }
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' })
})
