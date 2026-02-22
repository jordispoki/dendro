import { prisma } from '~/server/utils/prisma'
import { seal, defaults as ironDefaults } from 'iron-webcrypto'

export default defineEventHandler(async (event) => {
  const { email } = await readBody(event)
  if (!email || typeof email !== 'string') {
    throw createError({ statusCode: 400, message: 'Email required' })
  }

  const config = useRuntimeConfig()

  // Create or find user
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email },
  })

  // Generate a signed token valid for 15 minutes
  const payload = { userId: user.id, email, exp: Date.now() + 15 * 60 * 1000 }
  const token = await seal(globalThis.crypto, payload, config.sessionPassword, {
    ...ironDefaults,
    ttl: 15 * 60 * 1000,
  })

  const origin = getRequestURL(event).origin
  const magicLink = `${origin}/api/auth/magic-link/verify?token=${encodeURIComponent(token)}`

  // In development, log the link; in production send via email
  if (process.env.NODE_ENV === 'development') {
    console.log('\n🔗 Magic link:', magicLink, '\n')
    return { message: 'Magic link logged to console (dev mode)', magicLink }
  }

  // Production: send email via Resend
  if (!config.resendApiKey) {
    return { message: 'Magic link (no email configured)', magicLink }
  }

  try {
    await $fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: {
        from: config.fromEmail,
        to: email,
        subject: 'Sign in to Chat Tree',
        html: `<p>Click <a href="${magicLink}">this link</a> to sign in. It expires in 15 minutes.</p>`,
      },
    })
  } catch (err) {
    console.error('Email send error:', err)
    throw createError({ statusCode: 500, message: 'Failed to send email' })
  }

  return { message: 'Magic link sent to your email' }
})
