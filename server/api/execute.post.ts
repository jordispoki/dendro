import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { prisma } from '~/server/utils/prisma'
import { logActivity } from '~/server/utils/activityLogger'

const execFileAsync = promisify(execFile)

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  const settings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
  })

  if (!settings?.localExecutionEnabled) {
    throw createError({ statusCode: 403, message: 'Local execution is not enabled' })
  }

  const { command, cwd, hostId, conversationId } = await readBody(event)

  if (!command || typeof command !== 'string') {
    throw createError({ statusCode: 400, message: 'Command required' })
  }

  // Optionally resolve conversation context for richer activity log entries
  let convContext: { conversationId: string; conversationTitle: string; treeId: string; treeTitle: string } | undefined
  if (conversationId && typeof conversationId === 'string') {
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId },
      select: { id: true, title: true, treeId: true, tree: { select: { title: true } } },
    })
    if (conv && conv.tree) {
      convContext = {
        conversationId: conv.id,
        conversationTitle: conv.title,
        treeId: conv.treeId,
        treeTitle: conv.tree.title,
      }
    }
  }

  // Remote execution via SSH
  if (hostId) {
    const hosts: any[] = JSON.parse(settings.remoteHosts || '[]')
    const host = hosts.find((h: any) => h.id === hostId)
    if (!host) {
      throw createError({ statusCode: 400, message: 'Unknown remote host' })
    }

    // Build the remote command, prepending cd if cwd is provided
    const remoteCmd = cwd ? `cd ${JSON.stringify(cwd)} && ${command}` : command

    const defaultSshOptions = ['-o', 'ConnectTimeout=10', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'BatchMode=yes']
    const customSshOptions = host.sshOptions ? host.sshOptions.trim().split(/\s+/) : null
    const sshArgs = [
      ...(customSshOptions ?? defaultSshOptions),
      '-p', String(host.port ?? 22),
    ]
    if (settings.sshConfigPath) sshArgs.push('-F', settings.sshConfigPath)
    if (host.keyPath) sshArgs.push('-i', host.keyPath)
    sshArgs.push(`${host.username}@${host.host}`, remoteCmd)

    const t0 = Date.now()
    try {
      const { stdout, stderr } = await execFileAsync('ssh', sshArgs, {
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      })
      logActivity(session.user.id, 'command.executed', {
        ...convContext,
        command: command.slice(0, 120),
        cwd: cwd || null,
        hostLabel: host.label || host.host,
        remote: true,
        exitCode: 0,
        durationMs: Date.now() - t0,
        stdoutLines: stdout ? stdout.split('\n').filter(Boolean).length : 0,
        stdoutPreview: stdout ? stdout.slice(0, 300) : '',
        stderrPreview: stderr ? stderr.slice(0, 300) : '',
      })
      return { stdout, stderr, exitCode: 0 }
    } catch (err: any) {
      const exitCode = err.code ?? 1
      const stdout: string = err.stdout || ''
      const stderr: string = err.stderr || err.message || 'SSH command failed'
      logActivity(session.user.id, 'command.executed', {
        ...convContext,
        command: command.slice(0, 120),
        cwd: cwd || null,
        hostLabel: host.label || host.host,
        remote: true,
        exitCode,
        durationMs: Date.now() - t0,
        stdoutLines: stdout ? stdout.split('\n').filter(Boolean).length : 0,
        stdoutPreview: stdout ? stdout.slice(0, 300) : '',
        stderrPreview: stderr ? stderr.slice(0, 300) : '',
      })
      return { stdout, stderr, exitCode }
    }
  }

  // Local execution
  const t0 = Date.now()
  try {
    const { stdout, stderr } = await execFileAsync('sh', ['-c', command], {
      cwd: cwd || undefined,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    })
    logActivity(session.user.id, 'command.executed', {
      ...convContext,
      command: command.slice(0, 120),
      cwd: cwd || null,
      hostLabel: 'local',
      remote: false,
      exitCode: 0,
      durationMs: Date.now() - t0,
      stdoutLines: stdout ? stdout.split('\n').filter(Boolean).length : 0,
      stdoutPreview: stdout ? stdout.slice(0, 300) : '',
      stderrPreview: stderr ? stderr.slice(0, 300) : '',
    })
    return { stdout, stderr, exitCode: 0 }
  } catch (err: any) {
    const exitCode = err.code ?? 1
    const stdout: string = err.stdout || ''
    const stderr: string = err.stderr || err.message || 'Command failed'
    logActivity(session.user.id, 'command.executed', {
      ...convContext,
      command: command.slice(0, 120),
      cwd: cwd || null,
      hostLabel: 'local',
      remote: false,
      exitCode,
      durationMs: Date.now() - t0,
      stdoutLines: stdout ? stdout.split('\n').filter(Boolean).length : 0,
      stdoutPreview: stdout ? stdout.slice(0, 300) : '',
      stderrPreview: stderr ? stderr.slice(0, 300) : '',
    })
    return { stdout, stderr, exitCode }
  }
})
