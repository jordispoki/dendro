import { prisma } from '~/server/utils/prisma'
import { getLLMProvider } from '~/server/services/llm/index'
import { logActivity } from '~/server/utils/activityLogger'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const { conversationId, upToMessageId, selectedText } = await readBody(event)

  if (!conversationId) {
    throw createError({ statusCode: 400, message: 'conversationId required' })
  }

  // Verify ownership
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId },
    include: { tree: true },
  })
  if (!conversation || conversation.tree.userId !== session.user.id) {
    throw createError({ statusCode: 404, message: 'Conversation not found' })
  }

  // Check cache first
  if (upToMessageId) {
    const cache = JSON.parse(conversation.summaryCache || '{}')
    if (cache[upToMessageId]) {
      return { summary: cache[upToMessageId], suggestedTitle: selectedText?.slice(0, 50) || 'New Branch', cached: true }
    }
  }

  // Walk up the full parent chain (root → ... → current), collecting messages
  const chatMessages = await collectAncestorMessages(conversationId, upToMessageId)

  if (chatMessages.length === 0) {
    return { summary: '', suggestedTitle: selectedText?.slice(0, 50) || 'New Branch' }
  }

  const llm = getLLMProvider(conversation.model)

  let summary = ''
  let suggestedTitle = selectedText?.slice(0, 50) || 'New Branch'

  try {
    const [s, t] = await Promise.all([
      llm.summarize(chatMessages, conversation.model),
      generateTitle(llm, selectedText, chatMessages, conversation.model),
    ])
    summary = s
    suggestedTitle = t
  } catch (err: any) {
    console.warn('Summarize LLM error (using fallback):', err?.message || err)
  }

  logActivity(session.user.id, 'summary.prepared', {
    conversationId,
    conversationTitle: conversation.title,
    treeId: conversation.treeId,
    treeTitle: conversation.tree.title,
    model: conversation.model,
    messageCount: chatMessages.length,
    cached: false,
  })

  // Save to cache
  if (upToMessageId && summary) {
    const cache = JSON.parse(conversation.summaryCache || '{}')
    cache[upToMessageId] = summary
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { summaryCache: JSON.stringify(cache) },
    })
  }

  return { summary, suggestedTitle }
})

// Walk from root down to the given conversation, collecting all messages in order.
// For the target conversation, only include messages up to upToMessageId (inclusive).
async function collectAncestorMessages(
  conversationId: string,
  upToMessageId?: string
): Promise<{ role: string; content: string }[]> {
  // Build the chain from current conversation up to root
  type ConvWithMessages = {
    id: string
    parentId: string | null
    messages: { id: string; role: string; content: string }[]
  }

  const chain: ConvWithMessages[] = []
  let currentId: string | null = conversationId

  while (currentId) {
    const conv = await prisma.conversation.findUnique({
      where: { id: currentId },
      select: {
        id: true,
        parentId: true,
        messages: { orderBy: { createdAt: 'asc' }, select: { id: true, role: true, content: true } },
      },
    })
    if (!conv) break
    chain.unshift(conv) // prepend so root ends up first
    currentId = conv.parentId
  }

  // Collect messages root → current, truncating at upToMessageId in the last conv
  const result: { role: string; content: string }[] = []

  for (let i = 0; i < chain.length; i++) {
    let msgs = chain[i].messages
    if (i === chain.length - 1 && upToMessageId) {
      const idx = msgs.findIndex((m) => m.id === upToMessageId)
      if (idx !== -1) msgs = msgs.slice(0, idx + 1)
    }
    for (const m of msgs) {
      result.push({ role: m.role, content: m.content })
    }
  }

  return result
}

async function generateTitle(
  llm: ReturnType<typeof getLLMProvider>,
  selectedText: string | undefined,
  messages: { role: string; content: string }[],
  model: string
): Promise<string> {
  if (!selectedText) return 'New Branch'

  try {
    const prompt = `Based on this selected text from a conversation, generate a short (3-6 word) branch title that captures what will be explored:

Selected text: "${selectedText.slice(0, 200)}"

Respond with ONLY the title, no quotes or punctuation.`

    const titleMessages = [{ role: 'user', content: prompt }]
    let title = ''
    await llm.streamChat(titleMessages, (chunk) => { title += chunk }, model)
    return title.trim().slice(0, 60) || selectedText.slice(0, 50)
  } catch {
    return selectedText.slice(0, 50)
  }
}
