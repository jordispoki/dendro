<script setup lang="ts">
import { marked } from 'marked'
import { useTreeStore, type MessageAttachment } from '~/stores/treeStore'
import { modelLabel } from '~/composables/useModels'
import { useExecute } from '~/composables/useExecute'

const props = defineProps<{
  message: {
    id: string
    conversationId: string
    role: string
    content: string
    attachments: MessageAttachment[]
    createdAt: string
  }
  conversationModel: string
  branchMarks: string[]
}>()

const emit = defineEmits<{ 'send-output': [content: string] }>()

const store = useTreeStore()
const { settings } = useSettings()
const { runCommand } = useExecute()

const localExecutionEnabled = computed(() => settings.value?.localExecutionEnabled === true)

const renderedContent = computed(() => {
  let content = props.message.content
  // Wrap branch-mark texts before markdown parsing so they survive HTML rendering
  for (const mark of props.branchMarks) {
    const escaped = mark.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    content = content.replace(new RegExp(escaped), `<mark class="branch-mark">$&</mark>`)
  }
  return marked.parse(content, {
    breaks: true,
    renderer: Object.assign(new marked.Renderer(), {
      link({ href, title, text }: { href: string; title?: string | null; text: string }) {
        const t = title ? ` title="${title}"` : ''
        return `<a href="${href}"${t} target="_blank" rel="noopener noreferrer">${text}</a>`
      },
    }),
  }) as string
})

// For user messages (plain text), compute split segments for highlighting
const userSegments = computed(() => {
  if (props.message.role !== 'user' || props.branchMarks.length === 0) return null
  const content = props.message.content
  const ranges: { start: number; end: number }[] = []
  for (const mark of props.branchMarks) {
    const idx = content.indexOf(mark)
    if (idx !== -1) ranges.push({ start: idx, end: idx + mark.length })
  }
  if (ranges.length === 0) return null
  ranges.sort((a, b) => a.start - b.start)
  const segments: { text: string; highlighted: boolean }[] = []
  let pos = 0
  for (const r of ranges) {
    if (r.start > pos) segments.push({ text: content.slice(pos, r.start), highlighted: false })
    segments.push({ text: content.slice(r.start, r.end), highlighted: true })
    pos = r.end
  }
  if (pos < content.length) segments.push({ text: content.slice(pos), highlighted: false })
  return segments
})

// Branch popup state
const popupVisible = ref(false)
const popupX = ref(0)
const popupY = ref(0)
const selectedText = ref('')
const selectedRange = ref<Range | null>(null)

function handleMouseUp(e: MouseEvent) {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || !selection.toString().trim()) {
    popupVisible.value = false
    return
  }

  selectedText.value = selection.toString().trim()
  selectedRange.value = selection.getRangeAt(0)

  const rect = selectedRange.value.getBoundingClientRect()
  popupX.value = rect.left + rect.width / 2 - 40
  popupY.value = rect.top - 48
  popupVisible.value = true
}

async function handleRun() {
  if (!selectedText.value || !store.currentTreeId) return
  const command = selectedText.value
  popupVisible.value = false

  try {
    const conversation = await $fetch<any>('/api/conversations', {
      method: 'POST',
      body: {
        treeId: store.currentTreeId,
        parentId: props.message.conversationId,
        title: command.slice(0, 50),
        model: settings.value?.defaultBranchModel || props.conversationModel,
        verbosity: 'normal',
        branchText: command,
        branchMessageId: props.message.id,
        branchSummary: null,
        branchType: 'run',
      },
    })

    store.setPendingTerminalCommand(conversation.id, command)
    store.addConversation(conversation)
    store.setActiveConversation(conversation.id)
  } catch (err: any) {
    console.error('Run branch error:', err)
    // Re-show popup so the user knows something went wrong
    popupVisible.value = true
  }
}

function handleBranch() {
  if (!selectedText.value) return

  store.openBranchPreview({
    parentConversationId: props.message.conversationId,
    parentMessageId: props.message.id,
    selectedText: selectedText.value,
    suggestedTitle: selectedText.value.slice(0, 50),
    model: props.conversationModel,
  })

  popupVisible.value = false

  // Fetch summary asynchronously
  $fetch('/api/summarize', {
    method: 'POST',
    body: {
      conversationId: props.message.conversationId,
      upToMessageId: props.message.id,
      selectedText: selectedText.value,
    },
  }).then((result: any) => {
    store.setBranchSummary(result.summary, result.suggestedTitle)
  }).catch((err) => {
    console.error('Summarize error:', err)
    store.setBranchSummary('', selectedText.value.slice(0, 50))
  })
}

// Close popup when clicking outside
onMounted(() => {
  document.addEventListener('mousedown', onDocMouseDown)
  if (props.message.role === 'assistant' && localExecutionEnabled.value) {
    nextTick(() => attachRunButtons())
  }
})

onUpdated(() => {
  if (props.message.role === 'assistant' && localExecutionEnabled.value) {
    attachRunButtons()
  }
})

onUnmounted(() => {
  document.removeEventListener('mousedown', onDocMouseDown)
})

function onDocMouseDown(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.branch-popup')) {
    popupVisible.value = false
  }
}

// Run button state per code block
const blockResults = ref<Map<string, { stdout: string; stderr: string; exitCode: number; isRunning: boolean }>>(new Map())
const contentRef = ref<HTMLElement | null>(null)

function attachRunButtons() {
  if (!contentRef.value) return
  const codeBlocks = contentRef.value.querySelectorAll('pre > code')
  codeBlocks.forEach((codeEl, idx) => {
    const pre = codeEl.parentElement as HTMLElement
    // Skip if already wrapped
    if (pre.parentElement?.classList.contains('run-block-wrapper')) return

    const wrapper = document.createElement('div')
    wrapper.className = 'run-block-wrapper relative'
    pre.parentNode?.insertBefore(wrapper, pre)
    wrapper.appendChild(pre)

    const blockKey = `block-${props.message.id}-${idx}`

    const btn = document.createElement('button')
    btn.className = 'run-btn absolute top-2 right-2 px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded font-mono'
    btn.textContent = 'Run'
    btn.addEventListener('click', () => runCodeBlock(codeEl.textContent || '', blockKey, btn))
    wrapper.appendChild(btn)

    // Result container
    const resultEl = document.createElement('div')
    resultEl.className = `run-result-${blockKey}`
    wrapper.appendChild(resultEl)
  })
}

async function runCodeBlock(code: string, blockKey: string, btn: HTMLButtonElement) {
  btn.textContent = 'Running…'
  btn.disabled = true

  try {
    const result = await runCommand(code)
    blockResults.value.set(blockKey, { ...result, isRunning: false })
    renderBlockResult(blockKey, code, result)
  } catch (err: any) {
    const errResult = { stdout: '', stderr: err?.message || 'Error', exitCode: 1, isRunning: false }
    blockResults.value.set(blockKey, errResult)
    renderBlockResult(blockKey, code, errResult)
  } finally {
    btn.textContent = 'Run'
    btn.disabled = false
  }
}

function renderBlockResult(
  blockKey: string,
  code: string,
  result: { stdout: string; stderr: string; exitCode: number }
) {
  if (!contentRef.value) return
  const resultEl = contentRef.value.querySelector(`.run-result-${blockKey}`)
  if (!resultEl) return

  resultEl.innerHTML = ''
  const container = document.createElement('div')
  container.className = 'mt-1 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-xs font-mono'

  const output = document.createElement('div')
  output.className = 'bg-gray-900 px-3 py-2 space-y-1 max-h-40 overflow-y-auto'
  if (result.stdout) {
    const s = document.createElement('div')
    s.className = 'text-green-400 whitespace-pre-wrap'
    s.textContent = result.stdout
    output.appendChild(s)
  }
  if (result.stderr) {
    const s = document.createElement('div')
    s.className = 'text-red-400 whitespace-pre-wrap'
    s.textContent = result.stderr
    output.appendChild(s)
  }
  const exitEl = document.createElement('div')
  exitEl.className = 'text-gray-500'
  exitEl.textContent = `Exit: ${result.exitCode}`
  output.appendChild(exitEl)
  container.appendChild(output)

  const footer = document.createElement('div')
  footer.className = 'flex justify-end px-3 py-1 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700'
  const sendBtn = document.createElement('button')
  sendBtn.className = 'text-xs text-indigo-600 dark:text-indigo-400 hover:underline'
  sendBtn.textContent = 'Send to chat'
  sendBtn.addEventListener('click', () => {
    const lines: string[] = [`\`\`\`\n$ ${code.trim().split('\n')[0]}`]
    if (result.stdout) lines.push(result.stdout)
    if (result.stderr) lines.push(result.stderr)
    lines.push(`\`\`\`\nExit code: ${result.exitCode}`)
    emit('send-output', lines.join('\n'))
  })
  footer.appendChild(sendBtn)
  container.appendChild(footer)

  resultEl.appendChild(container)
}
</script>

<template>
  <!-- User message: right-aligned bubble -->
  <div v-if="message.role === 'user'" class="flex flex-col items-end gap-1.5">
    <!-- Attachment chips -->
    <div v-if="message.attachments?.length" class="flex flex-wrap gap-1.5 justify-end">
      <div
        v-for="(att, i) in message.attachments"
        :key="i"
        class="flex items-center gap-1 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-lg px-2 py-0.5 text-xs text-indigo-600 dark:text-indigo-300"
      >
        <svg class="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
        </svg>
        <span class="max-w-[120px] truncate">{{ att.filename }}</span>
      </div>
    </div>

    <div
      class="max-w-[75%] bg-indigo-600 text-white rounded-2xl px-4 py-2.5 text-sm leading-relaxed select-text"
      @mouseup="handleMouseUp"
    >
      <div class="whitespace-pre-wrap">
        <template v-if="userSegments">
          <template v-for="(seg, i) in userSegments" :key="i">
            <mark v-if="seg.highlighted" class="branch-mark">{{ seg.text }}</mark>
            <span v-else>{{ seg.text }}</span>
          </template>
        </template>
        <template v-else>{{ message.content }}</template>
      </div>
    </div>

    <BranchPopup
      :visible="popupVisible"
      :x="popupX"
      :y="popupY"
      :selected-text="selectedText"
      :local-execution-enabled="localExecutionEnabled"
      @branch="handleBranch"
      @run="handleRun"
      @close="popupVisible = false"
    />
  </div>

  <!-- Assistant message: full-width, no bubble -->
  <div v-else class="w-full">
    <div
      ref="contentRef"
      class="prose prose-sm dark:prose-invert max-w-none text-gray-900 dark:text-gray-100 select-text"
      @mouseup="handleMouseUp"
      v-html="renderedContent"
    />

    <BranchPopup
      :visible="popupVisible"
      :x="popupX"
      :y="popupY"
      :selected-text="selectedText"
      :local-execution-enabled="localExecutionEnabled"
      @branch="handleBranch"
      @run="handleRun"
      @close="popupVisible = false"
    />
  </div>
</template>
