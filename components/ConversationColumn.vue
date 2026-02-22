<script setup lang="ts">
import { marked } from 'marked'
import { useTreeStore, type ConversationNode } from '~/stores/treeStore'
import { useLLM, type FileAttachment } from '~/composables/useLLM'
import { useExecute } from '~/composables/useExecute'

function parseMarkdown(content: string) {
  return marked.parse(content, { breaks: true }) as string
}

const props = defineProps<{
  conversation: ConversationNode
  role: 'ancestor' | 'active' | 'sibling'
}>()

const emit = defineEmits<{ 'send-output': [content: string] }>()

const store = useTreeStore()
const { sendMessage, loadMessages } = useLLM()
const { settings } = useSettings()
const { runCommand } = useExecute()

const inputValue = ref('')
const messagesEndRef = ref<HTMLElement | null>(null)

// File attachments
const selectedFiles = ref<FileAttachment[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)
const fileError = ref('')

// URL attachments
const selectedUrls = ref<string[]>([])
const urlInputVisible = ref(false)
const urlInputValue = ref('')
const urlError = ref('')
const urlInputRef = ref<HTMLInputElement | null>(null)

// Terminal panel
const terminalOpen = ref(false)
const terminalCwd = ref('')
const terminalCommand = ref('')
const terminalOutput = ref<{ stdout: string; stderr: string; exitCode: number } | null>(null)
const terminalRunning = ref(false)

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

const localExecutionEnabled = computed(() => settings.value?.localExecutionEnabled === true)

onMounted(async () => {
  if (!store.messages[props.conversation.id] && !store.isStreaming) {
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

  const files = [...selectedFiles.value]
  const urls = [...selectedUrls.value]
  inputValue.value = ''
  selectedFiles.value = []
  selectedUrls.value = []
  fileError.value = ''
  urlError.value = ''
  urlInputVisible.value = false
  urlInputValue.value = ''
  await sendMessage(props.conversation.id, text, files, urls)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

function openFilePicker() {
  fileInputRef.value?.click()
}

function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files) return
  fileError.value = ''

  const incoming = Array.from(input.files)
  const MAX_SIZE = 200 * 1024

  for (const file of incoming) {
    if (selectedFiles.value.length >= 5) {
      fileError.value = 'Maximum 5 files per message'
      break
    }
    if (file.size > MAX_SIZE) {
      fileError.value = `"${file.name}" exceeds 200 KB`
      continue
    }
    const reader = new FileReader()
    reader.onload = (ev) => {
      selectedFiles.value.push({
        filename: file.name,
        size: file.size,
        mimeType: file.type || 'text/plain',
        content: ev.target?.result as string,
      })
    }
    reader.readAsText(file)
  }

  // Reset so same file can be selected again
  input.value = ''
}

function removeFile(index: number) {
  selectedFiles.value.splice(index, 1)
}

function toggleUrlInput() {
  urlInputVisible.value = !urlInputVisible.value
  urlError.value = ''
  if (urlInputVisible.value) {
    nextTick(() => urlInputRef.value?.focus())
  }
}

function addUrl() {
  const raw = urlInputValue.value.trim()
  if (!raw) return
  const url = raw.startsWith('http') ? raw : `https://${raw}`
  try {
    new URL(url) // validate
  } catch {
    urlError.value = 'Invalid URL'
    return
  }
  if (selectedUrls.value.includes(url)) {
    urlError.value = 'Already added'
    return
  }
  selectedUrls.value.push(url)
  urlInputValue.value = ''
  urlError.value = ''
}

function removeUrl(index: number) {
  selectedUrls.value.splice(index, 1)
}

function urlInputKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') { e.preventDefault(); addUrl() }
  if (e.key === 'Escape') { urlInputVisible.value = false; urlInputValue.value = '' }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function runTerminalCommand() {
  if (!terminalCommand.value.trim() || terminalRunning.value) return
  terminalRunning.value = true
  terminalOutput.value = null
  try {
    const result = await runCommand(terminalCommand.value, terminalCwd.value || undefined)
    terminalOutput.value = result
  } finally {
    terminalRunning.value = false
  }
}

function terminalKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    runTerminalCommand()
  }
}

function sendOutputToChat() {
  if (!terminalOutput.value) return
  const { stdout, stderr, exitCode } = terminalOutput.value
  const lines: string[] = [`\`\`\`\n$ ${terminalCommand.value}`]
  if (stdout) lines.push(stdout)
  if (stderr) lines.push(stderr)
  lines.push(`\`\`\`\nExit code: ${exitCode}`)
  sendMessage(props.conversation.id, lines.join('\n'))
}

function handleSendOutput(content: string) {
  sendMessage(props.conversation.id, content)
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
        @send-output="handleSendOutput"
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

      <!-- LLM error banner -->
      <div
        v-if="store.streamingError && store.streamingConversationId === props.conversation.id"
        class="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300"
      >
        <svg class="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>{{ store.streamingError }}</span>
      </div>

      <div ref="messagesEndRef" />
    </div>

    <!-- Input (only for active column) -->
    <div
      v-if="role === 'active'"
      class="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shrink-0"
    >
      <!-- File attachment chips -->
      <div v-if="selectedFiles.length > 0" class="px-4 pt-3 flex flex-wrap gap-2">
        <div
          v-for="(file, i) in selectedFiles"
          :key="i"
          class="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-lg px-2.5 py-1 text-xs text-indigo-700 dark:text-indigo-300"
        >
          <svg class="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
          <span class="max-w-[120px] truncate">{{ file.filename }}</span>
          <span class="text-indigo-400">{{ formatSize(file.size) }}</span>
          <button class="text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-200 ml-0.5" @click="removeFile(i)">×</button>
        </div>
      </div>
      <p v-if="fileError" class="px-4 pt-1 text-xs text-red-500">{{ fileError }}</p>

      <!-- URL chips -->
      <div v-if="selectedUrls.length > 0" class="px-4 pt-2 flex flex-wrap gap-2">
        <div
          v-for="(url, i) in selectedUrls"
          :key="i"
          class="flex items-center gap-1.5 bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg px-2.5 py-1 text-xs text-sky-700 dark:text-sky-300"
        >
          <svg class="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <span class="max-w-[200px] truncate">{{ url }}</span>
          <button class="text-sky-400 hover:text-sky-600 dark:hover:text-sky-200 ml-0.5" @click="removeUrl(i)">×</button>
        </div>
      </div>

      <!-- URL input row -->
      <div v-if="urlInputVisible" class="px-4 pt-2 flex gap-2 items-center">
        <input
          ref="urlInputRef"
          v-model="urlInputValue"
          type="text"
          placeholder="https://…"
          class="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-sky-300 dark:border-sky-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
          @keydown.stop="urlInputKeydown"
          @click.stop
        />
        <button
          class="text-xs px-2.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors"
          @click.stop="addUrl"
        >
          Add
        </button>
      </div>
      <p v-if="urlError" class="px-4 pt-1 text-xs text-red-500">{{ urlError }}</p>

      <!-- Input row -->
      <div class="px-4 py-3 flex items-end gap-2">
        <!-- Paperclip (hidden file input) -->
        <input
          ref="fileInputRef"
          type="file"
          multiple
          accept="text/*,.ts,.tsx,.js,.jsx,.py,.json,.md,.sh,.vue,.rs,.go,.java,.rb,.cpp,.c,.cs,.php,.swift,.kt"
          class="hidden"
          @change="handleFileSelect"
        />
        <button
          :disabled="selectedFiles.length >= 5 || store.isStreaming"
          class="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Attach files"
          @click.stop="openFilePicker"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        </button>

        <!-- Link button -->
        <button
          :disabled="store.isStreaming"
          :class="[
            'shrink-0 flex items-center justify-center w-8 h-8 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
            urlInputVisible
              ? 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/30'
              : 'text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-gray-100 dark:hover:bg-gray-800',
          ]"
          title="Add URL to fetch"
          @click.stop="toggleUrlInput"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </button>

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

      <!-- Terminal panel (only when localExecutionEnabled) -->
      <div v-if="localExecutionEnabled" class="border-t border-gray-200 dark:border-gray-700">
        <button
          class="w-full flex items-center justify-between px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          @click.stop="terminalOpen = !terminalOpen"
        >
          <span class="flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Terminal
          </span>
          <svg
            class="w-3.5 h-3.5 transition-transform"
            :class="terminalOpen ? 'rotate-180' : ''"
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <div v-if="terminalOpen" class="px-4 pb-3 space-y-2">
          <input
            v-model="terminalCwd"
            type="text"
            placeholder="Working directory (optional)"
            class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
            @click.stop
          />
          <div class="flex gap-2">
            <input
              v-model="terminalCommand"
              type="text"
              placeholder="Command…"
              class="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
              :disabled="terminalRunning"
              @click.stop
              @keydown.stop="terminalKeydown"
            />
            <button
              :disabled="!terminalCommand.trim() || terminalRunning"
              class="shrink-0 px-3 py-1.5 text-xs font-medium bg-gray-700 dark:bg-gray-600 hover:bg-gray-800 dark:hover:bg-gray-500 disabled:opacity-40 text-white rounded-lg transition-colors"
              @click.stop="runTerminalCommand"
            >
              {{ terminalRunning ? 'Running…' : 'Run' }}
            </button>
          </div>

          <div v-if="terminalOutput" class="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div class="bg-gray-900 px-3 py-2 space-y-1 max-h-48 overflow-y-auto font-mono text-xs">
              <div v-if="terminalOutput.stdout" class="text-green-400 whitespace-pre-wrap">{{ terminalOutput.stdout }}</div>
              <div v-if="terminalOutput.stderr" class="text-red-400 whitespace-pre-wrap">{{ terminalOutput.stderr }}</div>
              <div class="text-gray-500">Exit: {{ terminalOutput.exitCode }}</div>
            </div>
            <div class="flex justify-end px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
              <button
                class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                @click.stop="sendOutputToChat"
              >
                Send to chat
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
