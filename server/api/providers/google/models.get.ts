export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const config = useRuntimeConfig()
  const apiKey = config.geminiApiKey as string
  if (!apiKey) throw createError({ statusCode: 400, message: 'Gemini API key not configured' })

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=200`
  )
  if (!res.ok) throw createError({ statusCode: res.status, message: 'Failed to fetch Google models' })

  const data = await res.json() as any
  const models = (data.models as any[] || [])
    .filter((m) =>
      m.supportedGenerationMethods?.includes('generateContent') &&
      !m.name.includes('embedding') &&
      !m.name.includes('aqa')
    )
    .map((m) => ({
      value: `google/${m.name.replace('models/', '')}`,
      label: m.displayName ?? m.name.replace('models/', ''),
      free: false,
    }))
    .sort((a: any, b: any) => a.label.localeCompare(b.label))

  return { models }
})
