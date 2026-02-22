import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { prisma } from '~/server/utils/prisma'

const execFileAsync = promisify(execFile)

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  const settings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
  })

  if (!settings?.localExecutionEnabled) {
    throw createError({ statusCode: 403, message: 'Local execution is not enabled' })
  }

  const { command, cwd } = await readBody(event)

  if (!command || typeof command !== 'string') {
    throw createError({ statusCode: 400, message: 'Command required' })
  }

  try {
    const { stdout, stderr } = await execFileAsync('sh', ['-c', command], {
      cwd: cwd || undefined,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    })
    return { stdout, stderr, exitCode: 0 }
  } catch (err: any) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || err.message || 'Command failed',
      exitCode: err.code ?? 1,
    }
  }
})
