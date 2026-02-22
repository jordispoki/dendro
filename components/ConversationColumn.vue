<script setup lang="ts">
import { marked } from 'marked'
import { useTreeStore, type ConversationNode } from '~/stores/treeStore'
import { useLLM } from '~/composables/useLLM'

function parseMarkdown(content: string) {
  return marked.parse(content, { breaks: true }) as string
}

const props = defineProps<{
  conversation: ConversationNode
  role: 'ancestor' | 'active' | 'sibling'
}>()

const store = useTreeStore()
const { sendMessage, loadMessages } = useLLM()

const inputValue = ref('')
const messagesEndRef = ref<HTMLElement | null>(null)

const messages = computed(() => store.messages[props.conversation.id] || [])

// Map messageId → branch texts for all non-deleted/non-closed child branches
const branchMarksByMessageId = computed(() => {
  const map: Record<string, string[]> = {}
  for (const child of props.conversation.children) {
    if (child.branchMessageId && child.branchText && !child.deletedAt && !child.closedAt) {
      if (!map[child.branchMessageId]) map[child.branchMessageId] = []
      map[child.branchMessageId].push(child.branchText)
    }
  }
  return map
})

const isActiveStreaming = computed(
  () => store.streamingConversationId === props.conversation.id && store.isStreaming
)

onMounted(async () => {
  if (!store.messages[props.conversation.id]) {
    await loadMessages(props.conversation.id)
  }
})

watch(
  [messages, () => store.streamingContent],
  async () => {
    await nextTick()
    messagesEndRef.value?.scrollIntoView({ behavior: 'smooth' })
  }
)

function handleColumnClick() {
  if (props.role !== 'active') {
    store.setActiveConversation(props.conversation.id)
  }
}

async function handleSend() {
  const text = inputValue.value.trim()
  if (!text || store.isStreaming) return

  inputValue.value = ''
  await sendMessage(props.conversation.id, text)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}
</script>

<template>
  <div
    :class="[
      'flex flex-col h-full border-r border-gray-200 dark:border-gray-700 transition-all duration-200',
      role === 'active'
        ? 'flex-[3] min-w-[420px]'
        : 'flex-1 min-w-[200px] opacity-60 cursor-pointer hover:opacity-80',
    ]"
    @click="handleColumnClick"
  >
    <!-- Header (non-active columns only) -->
    <div
      v-if="role !== 'active'"
      class="flex items-center px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shrink-0"
    >
      <span class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ conversation.title }}</span>
    </div>

    <!-- Branch context indicator (active branch columns only) -->
    <div
      v-if="conversation.branchText && role === 'active'"
      class="px-4 py-2 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-100 dark:border-yellow-800 text-xs text-yellow-700 dark:text-yellow-300 shrink-0"
    >
      <span class="font-medium">Branched from:</span> "{{ conversation.branchText.slice(0, 100) }}{{ conversation.branchText.length > 100 ? '…' : '' }}"
    </div>

    <!-- Messages -->
    <div class="flex-1 overflow-y-auto px-4 py-4 space-y-6 bg-white dark:bg-gray-900">
      <div v-if="messages.length === 0 && !isActiveStreaming" class="text-center text-sm text-gray-400 dark:text-gray-500 py-8">
        No messages yet. Start the conversation!
      </div>

      <MessageBubble
        v-for="msg in messages"
        :key="msg.id"
        :message="msg"
        :conversation-model="conversation.model"
        :branch-marks="branchMarksByMessageId[msg.id] || []"
      />

      <!-- Streaming response -->
      <div v-if="isActiveStreaming" class="w-full">
        <div
          v-if="store.streamingContent"
          class="prose prose-sm dark:prose-invert max-w-none text-gray-900 dark:text-gray-100"
          v-html="parseMarkdown(store.streamingContent)"
        />
        <span v-else class="flex gap-1 pt-1">
          <span class="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style="animation-delay: 0ms" />
          <span class="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style="animation-delay: 150ms" />
          <span class="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style="animation-delay: 300ms" />
        </span>
      </div>

      <div ref="messagesEndRef" />
    </div>

    <!-- Input (only for active column) -->
    <div
      v-if="role === 'active'"
      class="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shrink-0"
    >
      <div class="flex items-end gap-2">
        <textarea
          v-model="inputValue"
          rows="1"
          placeholder="Message…"
          :disabled="store.isStreaming"
          class="flex-1 resize-none rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 max-h-40 overflow-y-auto"
          style="field-sizing: content"
          @keydown="handleKeydown"
        />
        <button
          :disabled="!inputValue.trim() || store.isStreaming"
          class="shrink-0 flex items-center justify-center w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          @click="handleSend"
        >
          <svg class="w-4 h-4 rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>
