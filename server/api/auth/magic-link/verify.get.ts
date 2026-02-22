import { prisma } from '~/server/utils/prisma'
import { unseal, defaults as ironDefaults } from 'iron-webcrypto'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const token = query.token as string

  if (!token) {
    return sendRedirect(event, '/login?error=invalid-token')
  }

  const config = useRuntimeConfig()

  try {
    const data = await unseal(globalThis.crypto, token, config.sessionPassword, {
      ...ironDefaults,
      ttl: 15 * 60 * 1000,
    }) as { userId: string; email: string; exp: number }

    if (!data?.userId) {
      return sendRedirect(event, '/login?error=invalid-token')
    }

    if (Date.now() > data.exp) {
      return sendRedirect(event, '/login?error=expired-token')
    }

    const user = await prisma.user.findUnique({ where: { id: data.userId } })
    if (!user) {
      return sendRedirect(event, '/login?error=user-not-found')
    }

    await setUserSession(event, {
      user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar },
    })
    return sendRedirect(event, '/')
  } catch (err) {
    console.error('Magic link verify error:', err)
    return sendRedirect(event, '/login?error=invalid-token')
  }
})
