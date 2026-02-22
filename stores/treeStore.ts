import { defineStore } from 'pinia'

export interface ConversationNode {
  id: string
  treeId: string
  parentId: string | null
  title: string
  model: string
  verbosity: string
  branchText: string | null
  branchMessageId: string | null
  branchSummary: string | null
  closedAt: string | null
  deletedAt: string | null
  createdAt: string
  children: ConversationNode[]
}

export interface Message {
  id: string
  conversationId: string
  role: string
  content: string
  createdAt: string
}

export interface BranchPreview {
  open: boolean
  parentConversationId: string
  parentMessageId: string
  selectedText: string
  summary: string | null
  isSummarizing: boolean
  suggestedTitle: string
  model: string
}

export const useTreeStore = defineStore('tree', {
  state: () => ({
    currentTreeId: null as string | null,
    rootConversation: null as ConversationNode | null,
    activeConversationId: null as string | null,
    conversationMap: {} as Record<string, ConversationNode>,
    messages: {} as Record<string, Message[]>,
    streamingConversationId: null as string | null,
    streamingContent: '',
    isStreaming: false,
    branchPreview: null as BranchPreview | null,
  }),

  getters: {
    activeConversation: (state): ConversationNode | null => {
      if (!state.activeConversationId) return null
      return state.conversationMap[state.activeConversationId] || null
    },
  },

  actions: {
    // Load a full tree from API
    loadTree(tree: { id: string; conversations: ConversationNode[] }) {
      this.currentTreeId = tree.id
      this.conversationMap = {}

      // Build flat map first
      for (const conv of (tree.conversations ?? [])) {
        this.conversationMap[conv.id] = { ...conv, children: [] }
      }

      // Build parent-child relationships
      let root: ConversationNode | null = null
      for (const conv of (tree.conversations ?? [])) {
        if (!conv.parentId) {
          root = this.conversationMap[conv.id]
        } else {
          const parent = this.conversationMap[conv.parentId]
          if (parent) {
            parent.children.push(this.conversationMap[conv.id])
          }
        }
      }

      this.rootConversation = root

      // Set active to root if not already set
      if (!this.activeConversationId && root) {
        this.activeConversationId = root.id
      }
    },

    setActiveConversation(id: string) {
      if (this.conversationMap[id]) {
        this.activeConversationId = id
      }
    },

    addConversation(conv: ConversationNode) {
      this.conversationMap[conv.id] = { ...conv, children: [] }
      if (conv.parentId && this.conversationMap[conv.parentId]) {
        this.conversationMap[conv.parentId].children.push(this.conversationMap[conv.id])
      }
      if (!conv.parentId) {
        this.rootConversation = this.conversationMap[conv.id]
      }
    },

    updateConversation(id: string, updates: Partial<ConversationNode>) {
      if (this.conversationMap[id]) {
        Object.assign(this.conversationMap[id], updates)
      }
    },

    closeConversation(id: string) {
      const conv = this.conversationMap[id]
      if (!conv) return

      // Mark as closed — keep in map so the minimap can still show it
      conv.closedAt = new Date().toISOString()

      // Navigate away if this was the active column
      if (this.activeConversationId === id) {
        if (conv.parentId && this.conversationMap[conv.parentId]) {
          this.activeConversationId = conv.parentId
        } else if (this.rootConversation) {
          this.activeConversationId = this.rootConversation.id
        }
      }
    },

    reopenConversation(id: string) {
      const conv = this.conversationMap[id]
      if (!conv) return
      conv.closedAt = null
      this.activeConversationId = id
    },

    softDeleteConversation(id: string) {
      const conv = this.conversationMap[id]
      if (!conv) return

      conv.deletedAt = new Date().toISOString()

      // Remove from parent's children
      if (conv.parentId && this.conversationMap[conv.parentId]) {
        const parent = this.conversationMap[conv.parentId]
        parent.children = parent.children.filter((c) => c.id !== id)
      }

      // If active, navigate to parent
      if (this.activeConversationId === id) {
        if (conv.parentId && this.conversationMap[conv.parentId]) {
          this.activeConversationId = conv.parentId
        } else if (this.rootConversation) {
          this.activeConversationId = this.rootConversation.id
        }
      }

      // Remove from map
      delete this.conversationMap[id]
    },

    setMessages(conversationId: string, messages: Message[]) {
      this.messages[conversationId] = messages
    },

    addMessage(conversationId: string, message: Message) {
      if (!this.messages[conversationId]) {
        this.messages[conversationId] = []
      }
      this.messages[conversationId].push(message)
    },

    startStreaming(conversationId: string) {
      this.streamingConversationId = conversationId
      this.streamingContent = ''
      this.isStreaming = true
    },

    appendStreamChunk(chunk: string) {
      this.streamingContent += chunk
    },

    finishStreaming() {
      if (this.streamingConversationId && this.streamingContent) {
        const id = this.streamingConversationId
        const content = this.streamingContent
        // Add the complete message only if there's actual content
        if (!this.messages[id]) this.messages[id] = []
        this.messages[id].push({
          id: `streaming-${Date.now()}`,
          conversationId: id,
          role: 'assistant',
          content,
          createdAt: new Date().toISOString(),
        })
      }
      this.streamingConversationId = null
      this.streamingContent = ''
      this.isStreaming = false
    },

    openBranchPreview(payload: Omit<BranchPreview, 'open' | 'isSummarizing' | 'summary'>) {
      this.branchPreview = {
        ...payload,
        open: true,
        isSummarizing: true,
        summary: null,
      }
    },

    setBranchSummary(summary: string, suggestedTitle: string) {
      if (this.branchPreview) {
        this.branchPreview.summary = summary
        this.branchPreview.suggestedTitle = suggestedTitle
        this.branchPreview.isSummarizing = false
      }
    },

    closeBranchPreview() {
      this.branchPreview = null
    },

    reset() {
      this.currentTreeId = null
      this.rootConversation = null
      this.activeConversationId = null
      this.conversationMap = {}
      this.messages = {}
      this.streamingConversationId = null
      this.streamingContent = ''
      this.isStreaming = false
      this.branchPreview = null
    },
  },
})
