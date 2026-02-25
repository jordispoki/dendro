import { prisma } from '~/server/utils/prisma'
import { getLLMProvider } from '~/server/services/llm/index'
import { buildContext } from '~/server/services/context'
import { extractUrls, fetchUrlContent } from '~/server/services/urlFetch'
import { logActivity } from '~/server/utils/activityLogger'
import { logBus } from '~/server/utils/logBus'

function guessLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', json: 'json', md: 'markdown', sh: 'bash', css: 'css',
    html: 'html', vue: 'vue', rs: 'rust', go: 'go', java: 'java', rb: 'ruby',
    cpp: 'cpp', c: 'c', cs: 'csharp', php: 'php', swift: 'swift', kt: 'kotlin',
  }
  return map[ext] || ext || 'text'
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const id = getRouterParam(event, 'id')
  const { content, attachments = [], explicitUrls = [] } = await readBody(event)

  if (!content || typeof content !== 'string') {
    throw createError({ statusCode: 400, message: 'Message content required' })
  }

  // Validate attachments
  if (!Array.isArray(attachments)) {
    throw createError({ statusCode: 400, message: 'attachments must be an array' })
  }
  if (attachments.length > 5) {
    throw createError({ statusCode: 400, message: 'Maximum 5 file attachments per message' })
  }
  const MAX_FILE_SIZE = 200 * 1024 // 200 KB
  for (const att of attachments) {
    if (att.size > MAX_FILE_SIZE) {
      throw createError({ statusCode: 400, message: `File "${att.filename}" exceeds 200 KB limit` })
    }
  }

  // Verify ownership
  const conversation = await prisma.conversation.findFirst({
    where: { id },
    include: { tree: true },
  })
  if (!conversation || conversation.tree.userId !== session.user.id) {
    throw createError({ statusCode: 404, message: 'Conversation not found' })
  }

  function buildLogEntry(msg: {
    id: string
    createdAt: Date
    content: string
    inputTokens: number | null
    outputTokens: number | null
  }) {
    return {
      id: msg.id,
      createdAt: msg.createdAt.toISOString(),
      content: msg.content,
      inputTokens: msg.inputTokens,
      outputTokens: msg.outputTokens,
      model: conversation.model,
      conversationId: conversation.id,
      conversationTitle: conversation.title,
      treeId: conversation.treeId,
      treeTitle: conversation.tree.title,
    }
  }

  // Save user message (strip file content from stored attachments)
  // fetchedUrls will be updated after fetching below — create with empty first
  const storedAttachments = attachments.map(({ filename, size, mimeType }: any) => ({ filename, size, mimeType }))
  const userMessage = await prisma.message.create({
    data: {
      conversationId: id!,
      role: 'user',
      content,
      attachments: JSON.stringify(storedAttachments),
    },
  })

  // Get user settings
  const settings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
  })
  const systemPrompt = settings?.systemPrompt || ''
  const streamingEnabled = settings?.streamingEnabled !== false // default true
  const followSameDomain = settings?.urlFetchSameDomain === true

  // Merge auto-detected URLs from message text with explicitly added URLs (deduplicated)
  const autoUrls = extractUrls(content)
  const allUrls = [...new Set([
    ...(Array.isArray(explicitUrls) ? explicitUrls.filter((u: any) => typeof u === 'string') : []),
    ...autoUrls,
  ])]
  const urlResults = await Promise.allSettled(allUrls.map((url) => fetchUrlContent(url, followSameDomain)))
  const fetchedUrls = allUrls
    .map((url, i) => ({
      url,
      content: urlResults[i].status === 'fulfilled' ? urlResults[i].value : '',
    }))
    .filter((u) => u.content)

  // Persist which URLs were successfully fetched on the user message
  if (fetchedUrls.length > 0) {
    await prisma.message.update({
      where: { id: userMessage.id },
      data: { fetchedUrls: JSON.stringify(fetchedUrls.map((u) => u.url)) },
    })
  }

  // Build file context from attachments
  let fileContext = ''
  if (attachments.length > 0) {
    fileContext = attachments
      .map((att: any) => {
        const lang = guessLanguage(att.filename)
        return `File: ${att.filename}\n\`\`\`${lang}\n${att.content}\n\`\`\``
      })
      .join('\n\n')
  }

  logActivity(session.user.id, 'message.sent', {
    conversationId: id,
    conversationTitle: conversation.title,
    treeId: conversation.treeId,
    treeTitle: conversation.tree.title,
    model: conversation.model,
    inputLength: content.length,
  })

  // Build context for LLM
  const messages = await buildContext(id!, systemPrompt, conversation.verbosity, fetchedUrls, fileContext)

  const contextChars = messages.reduce((sum, m) => sum + m.content.length, 0)
  logActivity(session.user.id, 'context.built', {
    conversationId: id,
    conversationTitle: conversation.title,
    treeId: conversation.treeId,
    treeTitle: conversation.tree.title,
    model: conversation.model,
    hasBranchSummary: !!conversation.branchSummary,
    contextUrlCount: JSON.parse(conversation.contextUrls || '[]').length,
    fetchedUrlCount: fetchedUrls.length,
    failedUrlCount: allUrls.length - fetchedUrls.length,
    attachmentCount: attachments.length,
    attachmentNames: attachments.map((a: any) => a.filename),
    contextTurns: messages.length,
    contextChars,
  })

  const llm = getLLMProvider(conversation.model)
  let fullResponse = ''

  if (!streamingEnabled) {
    // Non-streaming: collect full response and return as JSON
    try {
      const usage = await llm.streamChat(messages, (chunk) => { fullResponse += chunk }, conversation.model)
      const savedMsg = await prisma.message.create({
        data: {
          conversationId: id!,
          role: 'assistant',
          content: fullResponse,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        },
      })
      logBus.emit('log', { userId: session.user.id, entry: buildLogEntry(savedMsg) })
      return { content: fullResponse }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('LLM error:', msg)
      throw createError({ statusCode: 500, message: 'LLM error occurred' })
    }
  }

  // Streaming: SSE
  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  try {
    const usage = await llm.streamChat(
      messages,
      (chunk) => {
        fullResponse += chunk
        event.node.res.write(`data: ${JSON.stringify({ chunk })}\n\n`)
      },
      conversation.model
    )

    const savedMsg = await prisma.message.create({
      data: {
        conversationId: id!,
        role: 'assistant',
        content: fullResponse,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      },
    })
    logBus.emit('log', { userId: session.user.id, entry: buildLogEntry(savedMsg) })

    event.node.res.write(`data: ${JSON.stringify({ done: true, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens })}\n\n`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('LLM streaming error:', msg)
    event.node.res.write(`data: ${JSON.stringify({ error: 'LLM error occurred' })}\n\n`)
  }

  event.node.res.end()
})
