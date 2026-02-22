export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const config = useRuntimeConfig()
  const apiKey = config.openrouterApiKey as string
  if (!apiKey) throw createError({ statusCode: 400, message: 'OpenRouter API key not configured' })

  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) throw createError({ statusCode: res.status, message: 'Failed to fetch OpenRouter models' })

  const data = await res.json() as any
  const models = (data.data as any[] || [])
    .map((m) => {
      const isFree =
        m.id.endsWith(':free') ||
        (parseFloat(m.pricing?.prompt ?? '1') === 0 && parseFloat(m.pricing?.completion ?? '1') === 0)
      return {
        value: `openrouter/${m.id}`,
        label: m.name ?? m.id,
        free: isFree,
      }
    })
    .sort((a: any, b: any) => a.label.localeCompare(b.label))

  return { models }
})
