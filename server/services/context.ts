import { prisma } from '~/server/utils/prisma'
import type { ChatMessage } from './llm/index'

const VERBOSITY_INSTRUCTIONS: Record<string, string> = {
  concise: 'Be concise. Keep responses short and direct — no unnecessary elaboration.',
  normal: '',
  detailed: 'Be thorough. Provide detailed explanations with context and examples where helpful.',
}

export async function buildContext(
  conversationId: string,
  systemPrompt: string,
  verbosity = 'normal',
  fetchedUrls: { url: string; content: string }[] = [],
  fileContext = ''
): Promise<ChatMessage[]> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })

  if (!conversation) throw new Error('Conversation not found')

  const messages: ChatMessage[] = []

  // Add system prompt if present
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt })
  }

  // Inject verbosity instruction
  const verbosityInstruction = VERBOSITY_INSTRUCTIONS[verbosity]
  if (verbosityInstruction) {
    messages.push({ role: 'system', content: verbosityInstruction })
  }

  if (conversation.parentId) {
    // Branch conversation: use stored summary + selected text as context
    if (conversation.branchSummary) {
      messages.push({
        role: 'system',
        content: `Context from parent conversation:\n${conversation.branchSummary}`,
      })
    }
    if (conversation.branchText) {
      messages.push({
        role: 'user',
        content: `I want to explore this part specifically: "${conversation.branchText}"`,
      })
      messages.push({
        role: 'assistant',
        content: `I'll help you explore that. What would you like to know?`,
      })
    }
  }

  // Inject persistent context URLs (scraped and stored on the conversation)
  const storedContextUrls: { url: string; content: string }[] = JSON.parse(conversation.contextUrls || '[]')
  if (storedContextUrls.length > 0) {
    const blocks = storedContextUrls
      .filter((u) => u.content)
      .map((u) => `--- ${u.url} ---\n${u.content}`)
      .join('\n\n')
    if (blocks) {
      messages.push({
        role: 'system',
        content: `Context from scraped URLs:\n\n${blocks}`,
      })
    }
  }

  // Inject fetched URL content
  if (fetchedUrls.length > 0) {
    const urlBlocks = fetchedUrls
      .filter((u) => u.content)
      .map((u) => `--- ${u.url} ---\n${u.content}`)
      .join('\n\n')
    if (urlBlocks) {
      messages.push({
        role: 'system',
        content: `The user's message contains URLs. Here is the fetched content:\n\n${urlBlocks}`,
      })
    }
  }

  // Inject file attachments context
  if (fileContext) {
    messages.push({ role: 'system', content: fileContext })
  }

  // Inject tree-level context URLs
  const treeData = await prisma.tree.findUnique({ where: { id: conversation.treeId }, select: { contextUrls: true } })
  const treeContextUrls: { url: string; content: string }[] = JSON.parse(treeData?.contextUrls || '[]')
  if (treeContextUrls.length > 0) {
    const blocks = treeContextUrls.filter((u) => u.content).map((u) => `--- ${u.url} ---\n${u.content}`).join('\n\n')
    if (blocks) {
      messages.push({ role: 'system', content: `Dendro context URLs:\n\n${blocks}` })
    }
  }

  // Inject project files for this tree
  const projectFiles = await prisma.projectFile.findMany({
    where: { treeId: conversation.treeId },
    orderBy: { createdAt: 'asc' },
  })
  if (projectFiles.length > 0) {
    const projectFileBlocks = projectFiles
      .map((f) => `<project_file name="${f.name}">\n${f.content}\n</project_file>`)
      .join('\n\n')
    messages.push({
      role: 'system',
      content: `Project context files:\n\n${projectFileBlocks}`,
    })
  }

  // Add own messages
  for (const msg of conversation.messages) {
    messages.push({ role: msg.role, content: msg.content })
  }

  return messages
}
