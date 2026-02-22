import { prisma } from '~/server/utils/prisma'

export default defineOAuthGitHubEventHandler({
  config: {
    scope: ['user:email'],
  },
  async onSuccess(event, { user }) {
    const email = user.email || `${user.login}@github.com`
    const dbUser = await prisma.user.upsert({
      where: { email },
      update: { name: user.name || user.login, avatar: user.avatar_url },
      create: { email, name: user.name || user.login, avatar: user.avatar_url },
    })
    await setUserSession(event, {
      user: { id: dbUser.id, email: dbUser.email, name: dbUser.name, avatar: dbUser.avatar },
    })
    return sendRedirect(event, '/')
  },
  onError(event, error) {
    console.error('GitHub OAuth error:', error)
    return sendRedirect(event, '/login?error=github')
  },
})
