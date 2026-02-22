<script setup lang="ts">
import { marked } from 'marked'
import { useTreeStore } from '~/stores/treeStore'
import { modelLabel } from '~/composables/useModels'

const props = defineProps<{
  message: {
    id: string
    conversationId: string
    role: string
    content: string
    createdAt: string
  }
  conversationModel: string
  branchMarks: string[]
}>()

const store = useTreeStore()

const renderedContent = computed(() => {
  let content = props.message.content
  // Wrap branch-mark texts before markdown parsing so they survive HTML rendering
  for (const mark of props.branchMarks) {
    const escaped = mark.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    content = content.replace(new RegExp(escaped), `<mark class="branch-mark">$&</mark>`)
  }
  return marked.parse(content, { breaks: true }) as string
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
</script>

<template>
  <!-- User message: right-aligned bubble -->
  <div v-if="message.role === 'user'" class="flex justify-end">
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
      @branch="handleBranch"
      @close="popupVisible = false"
    />
  </div>

  <!-- Assistant message: full-width, no bubble -->
  <div v-else class="w-full">
    <div
      class="prose prose-sm dark:prose-invert max-w-none text-gray-900 dark:text-gray-100 select-text"
      @mouseup="handleMouseUp"
      v-html="renderedContent"
    />

    <BranchPopup
      :visible="popupVisible"
      :x="popupX"
      :y="popupY"
      :selected-text="selectedText"
      @branch="handleBranch"
      @close="popupVisible = false"
    />
  </div>
</template>
