export function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"]+/g
  const matches = text.match(urlRegex) || []
  return [...new Set(matches)]
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Extract same-domain <a href> links from raw HTML */
function extractSameDomainLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl)
  const hrefRegex = /href=["']([^"']+)["']/gi
  const links: string[] = []
  let m: RegExpExecArray | null

  while ((m = hrefRegex.exec(html)) !== null) {
    try {
      const href = m[1]
      const resolved = new URL(href, baseUrl).toString()
      const parsed = new URL(resolved)
      if (parsed.hostname === base.hostname && resolved !== baseUrl) {
        links.push(resolved)
      }
    } catch {
      // ignore invalid hrefs
    }
  }

  return [...new Set(links)]
}

async function fetchRaw(url: string): Promise<{ text: string; html: string } | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const response = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)

    if (!response.ok) return null

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) return null

    const html = await response.text()
    return { text: stripHtml(html), html }
  } catch {
    return null
  }
}

export async function fetchUrlContent(url: string, followSameDomain = false): Promise<string> {
  const primary = await fetchRaw(url)
  if (!primary) return ''

  let combined = primary.text.slice(0, 15000)

  if (followSameDomain) {
    const subLinks = extractSameDomainLinks(primary.html, url).slice(0, 5)
    const subResults = await Promise.allSettled(subLinks.map((l) => fetchRaw(l)))

    for (let i = 0; i < subResults.length; i++) {
      const r = subResults[i]
      if (r.status === 'fulfilled' && r.value) {
        const subText = r.value.text.slice(0, 5000)
        combined += `\n\n[Subpage: ${subLinks[i]}]\n${subText}`
      }
    }
  }

  return combined.slice(0, 30000)
}
