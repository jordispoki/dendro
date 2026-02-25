import { logBus } from '~/server/utils/logBus'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const stream = createEventStream(event)

  const handler = (data: { userId: string; entry: unknown }) => {
    if (data.userId === session.user.id) {
      stream.push(JSON.stringify(data.entry))
    }
  }

  logBus.on('activity', handler)

  stream.onClosed(async () => {
    logBus.off('activity', handler)
    await stream.close()
  })

  return stream.send()
})
