import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const query = getQuery(event)
  const prompt = String(query.prompt || 'Select file')

  try {
    if (process.platform === 'darwin') {
      const { stdout } = await execFileAsync('osascript', [
        '-e',
        `POSIX path of (choose file with prompt "${prompt}")`,
      ], { timeout: 60_000 })
      return { path: stdout.trim() }
    }

    if (process.platform === 'linux') {
      const { stdout } = await execFileAsync('zenity', [
        '--file-selection',
        `--title=${prompt}`,
      ], { timeout: 60_000 })
      return { path: stdout.trim() }
    }

    throw createError({ statusCode: 501, message: 'File picker not supported on this platform' })
  } catch (err: any) {
    // User cancelled (osascript exits with code 1, zenity with code 1)
    if (err.code === 1 || err.killed) {
      return { path: null }
    }
    throw createError({ statusCode: 500, message: err.message || 'File picker failed' })
  }
})
