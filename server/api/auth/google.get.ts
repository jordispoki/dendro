import { prisma } from '~/server/utils/prisma'

export default defineOAuthGoogleEventHandler({
  config: {
    scope: ['openid', 'email', 'profile'],
  },
  async onSuccess(event, { user }) {
    const email = user.email
    if (!email) {
      return sendRedirect(event, '/login?error=no-email')
    }
    const dbUser = await prisma.user.upsert({
      where: { email },
      update: { name: user.name, avatar: user.picture },
      create: { email, name: user.name, avatar: user.picture },
    })
    await setUserSession(event, {
      user: { id: dbUser.id, email: dbUser.email, name: dbUser.name, avatar: dbUser.avatar },
    })
    return sendRedirect(event, '/')
  },
  onError(event, error) {
    console.error('Google OAuth error:', error)
    return sendRedirect(event, '/login?error=google')
  },
})
