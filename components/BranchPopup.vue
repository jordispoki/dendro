<script setup lang="ts">
const props = defineProps<{
  x: number
  y: number
  visible: boolean
  selectedText: string
  localExecutionEnabled?: boolean
}>()

const { settings } = useSettings()
const popupSearchEnabled = computed(() => settings.value?.popupSearchEnabled !== false)
const popupSummarizeEnabled = computed(() => settings.value?.popupSummarizeEnabled !== false)

const emit = defineEmits<{
  branch: []
  run: []
  close: []
}>()

// Search
function handleSearch() {
  window.open('https://www.google.com/search?q=' + encodeURIComponent(props.selectedText), '_blank')
}

// Summarize to clipboard
type SummarizeState = 'idle' | 'loading' | 'done' | 'error'
const summarizeState = ref<SummarizeState>('idle')

async function handleSummarize() {
  if (summarizeState.value === 'loading') return
  summarizeState.value = 'loading'

  try {
    const result = await $fetch<{ summary: string }>('/api/summarize-text', {
      method: 'POST',
      body: { text: props.selectedText },
    })
    await navigator.clipboard.writeText(result.summary)
    summarizeState.value = 'done'
    setTimeout(() => { summarizeState.value = 'idle' }, 2000)
  } catch {
    summarizeState.value = 'error'
    setTimeout(() => { summarizeState.value = 'idle' }, 2000)
  }
}

// Reset state when popup closes
watch(() => props.visible, (v) => {
  if (!v) summarizeState.value = 'idle'
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      :style="{ position: 'fixed', left: `${x}px`, top: `${y}px`, zIndex: 1000 }"
      class="branch-popup flex items-center gap-1 bg-gray-900 dark:bg-gray-800 rounded-full shadow-xl px-1 py-1"
    >
      <!-- Branch -->
      <button
        class="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-full transition-colors"
        @click="emit('branch')"
        @mousedown.prevent
      >
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
        Branch
      </button>

      <!-- Search -->
      <button
        v-if="popupSearchEnabled"
        class="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white text-xs font-medium rounded-full transition-colors"
        title="Search Google"
        @click="handleSearch"
        @mousedown.prevent
      >
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        Search
      </button>

      <!-- Summarize to clipboard -->
      <button
        v-if="popupSummarizeEnabled"
        class="flex items-center gap-1.5 px-3 py-1.5 text-white text-xs font-medium rounded-full transition-colors"
        :class="{
          'bg-violet-500 hover:bg-violet-600': summarizeState === 'idle',
          'bg-violet-400 cursor-wait': summarizeState === 'loading',
          'bg-green-500': summarizeState === 'done',
          'bg-red-500': summarizeState === 'error',
        }"
        :title="summarizeState === 'done' ? 'Copied!' : 'Summarize & copy to clipboard'"
        @click="handleSummarize"
        @mousedown.prevent
      >
        <!-- Spinner -->
        <svg v-if="summarizeState === 'loading'" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <!-- Checkmark -->
        <svg v-else-if="summarizeState === 'done'" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
        <!-- Default icon -->
        <svg v-else class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <span v-if="summarizeState === 'done'">Copied!</span>
        <span v-else-if="summarizeState === 'error'">Error</span>
        <span v-else>Summarize</span>
      </button>

      <!-- Run -->
      <button
        v-if="localExecutionEnabled"
        class="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium rounded-full transition-colors"
        title="Run as command in new branch"
        @click="emit('run')"
        @mousedown.prevent
      >
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        Run
      </button>
    </div>
  </Teleport>
</template>
