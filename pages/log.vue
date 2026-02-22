<script setup lang="ts">
import { estimateCost } from '~/utils/llmPrices'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const router = useRouter()

interface LogEntry {
  id: string
  createdAt: string
  content: string
  inputTokens: number | null
  outputTokens: number | null
  model: string
  conversationId: string
  conversationTitle: string
  treeId: string
  treeTitle: string
}

const entries = ref<LogEntry[]>([])
const trees = ref<{ id: string; title: string }[]>([])
const isLoading = ref(true)

const selectedTreeId = ref((route.query.dendro as string) || '')
const sortKey = ref<'createdAt' | 'inputTokens' | 'outputTokens' | 'cost'>('createdAt')
const sortDir = ref<'asc' | 'desc'>('desc')

async function fetchLog() {
  isLoading.value = true
  try {
    const params = selectedTreeId.value ? `?treeId=${selectedTreeId.value}` : ''
    entries.value = await $fetch<LogEntry[]>(`/api/log${params}`)
    // Collect unique trees
    const treeMap = new Map<string, string>()
    for (const e of entries.value) treeMap.set(e.treeId, e.treeTitle)
    // Also load all trees for filter dropdown
    const allTrees = await $fetch<any[]>('/api/trees')
    trees.value = allTrees.map((t) => ({ id: t.id, title: t.title }))
  } finally {
    isLoading.value = false
  }
}

watch(selectedTreeId, async (val) => {
  router.replace({ query: val ? { dendro: val } : {} })
  await fetchLog()
})

onMounted(fetchLog)

function shortModel(model: string): string {
  return model
    .replace('openrouter/', '')
    .replace('google/', '')
    .split('/').pop() || model
}

function formatTokens(n: number | null | undefined): string {
  if (n == null) return '—'
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

function formatCost(model: string, inputTokens: number | null, outputTokens: number | null): string {
  const cost = estimateCost(model, inputTokens, outputTokens)
  if (cost == null) return '—'
  if (cost < 0.0001) return '<$0.0001'
  return `$${cost.toFixed(4)}`
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function toggleSort(key: typeof sortKey.value) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'desc' ? 'asc' : 'desc'
  } else {
    sortKey.value = key
    sortDir.value = 'desc'
  }
}

const sortedEntries = computed(() => {
  return [...entries.value].sort((a, b) => {
    let va: number
    let vb: number
    if (sortKey.value === 'createdAt') {
      va = new Date(a.createdAt).getTime()
      vb = new Date(b.createdAt).getTime()
    } else if (sortKey.value === 'inputTokens') {
      va = a.inputTokens ?? -1
      vb = b.inputTokens ?? -1
    } else if (sortKey.value === 'outputTokens') {
      va = a.outputTokens ?? -1
      vb = b.outputTokens ?? -1
    } else {
      va = estimateCost(a.model, a.inputTokens, a.outputTokens) ?? -1
      vb = estimateCost(b.model, b.inputTokens, b.outputTokens) ?? -1
    }
    return sortDir.value === 'desc' ? vb - va : va - vb
  })
})

// Aggregate stats over the displayed entries
const stats = computed(() => {
  let totalIn = 0
  let totalOut = 0
  let totalCost = 0
  let costCovered = 0
  for (const e of sortedEntries.value) {
    if (e.inputTokens != null) totalIn += e.inputTokens
    if (e.outputTokens != null) totalOut += e.outputTokens
    const cost = estimateCost(e.model, e.inputTokens, e.outputTokens)
    if (cost != null) { totalCost += cost; costCovered++ }
  }
  return { totalIn, totalOut, totalCost, costCovered }
})

function formatBigTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
    <!-- Navbar -->
    <nav class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-2.5 flex items-center gap-3 shrink-0">
      <NuxtLink
        to="/"
        class="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors shrink-0"
        title="Back"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
      </NuxtLink>

      <div class="flex items-center gap-2">
        <svg class="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <span class="font-semibold text-gray-900 dark:text-white text-sm">LLM Log</span>
      </div>

      <div class="flex-1" />

      <!-- Dendro filter -->
      <select
        v-model="selectedTreeId"
        class="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <option value="">All Dendros</option>
        <option v-for="t in trees" :key="t.id" :value="t.id">{{ t.title }}</option>
      </select>
    </nav>

    <!-- Stats bar -->
    <div class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-3 flex flex-wrap gap-6 text-sm shrink-0">
      <div class="flex items-center gap-1.5">
        <span class="text-gray-400 dark:text-gray-500">Calls</span>
        <span class="font-semibold text-gray-900 dark:text-white">{{ sortedEntries.length }}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="text-gray-400 dark:text-gray-500">Input</span>
        <span class="font-semibold text-gray-900 dark:text-white">{{ formatBigTokens(stats.totalIn) }}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="text-gray-400 dark:text-gray-500">Output</span>
        <span class="font-semibold text-gray-900 dark:text-white">{{ formatBigTokens(stats.totalOut) }}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="text-gray-400 dark:text-gray-500">Est. cost</span>
        <span class="font-semibold text-indigo-600 dark:text-indigo-400">${{ stats.totalCost.toFixed(4) }}</span>
        <span v-if="stats.costCovered < sortedEntries.length" class="text-xs text-gray-400">(partial)</span>
      </div>
    </div>

    <!-- Table -->
    <div class="flex-1 overflow-auto">
      <div v-if="isLoading" class="flex items-center justify-center py-20 text-gray-400">
        <svg class="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading…
      </div>

      <div v-else-if="sortedEntries.length === 0" class="text-center py-20 text-gray-400 dark:text-gray-500">
        No LLM calls recorded yet.
      </div>

      <table v-else class="w-full text-sm border-collapse">
        <thead class="sticky top-0 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
          <tr>
            <th class="text-left px-4 py-2.5 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Dendro</th>
            <th class="text-left px-4 py-2.5 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Branch</th>
            <th class="text-left px-4 py-2.5 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Model</th>
            <th
              class="text-right px-4 py-2.5 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap cursor-pointer hover:text-indigo-600 select-none"
              @click="toggleSort('inputTokens')"
            >
              In <span v-if="sortKey === 'inputTokens'">{{ sortDir === 'desc' ? '↓' : '↑' }}</span>
            </th>
            <th
              class="text-right px-4 py-2.5 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap cursor-pointer hover:text-indigo-600 select-none"
              @click="toggleSort('outputTokens')"
            >
              Out <span v-if="sortKey === 'outputTokens'">{{ sortDir === 'desc' ? '↓' : '↑' }}</span>
            </th>
            <th
              class="text-right px-4 py-2.5 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap cursor-pointer hover:text-indigo-600 select-none"
              @click="toggleSort('cost')"
            >
              Cost <span v-if="sortKey === 'cost'">{{ sortDir === 'desc' ? '↓' : '↑' }}</span>
            </th>
            <th
              class="text-right px-4 py-2.5 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap cursor-pointer hover:text-indigo-600 select-none"
              @click="toggleSort('createdAt')"
            >
              Age <span v-if="sortKey === 'createdAt'">{{ sortDir === 'desc' ? '↓' : '↑' }}</span>
            </th>
            <th class="text-left px-4 py-2.5 font-medium text-gray-500 dark:text-gray-400">Preview</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="entry in sortedEntries"
            :key="entry.id"
            class="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
          >
            <td class="px-4 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap max-w-[140px] truncate">
              <NuxtLink
                :to="`/tree/${entry.treeId}`"
                class="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                :title="entry.treeTitle"
              >
                {{ entry.treeTitle }}
              </NuxtLink>
            </td>
            <td class="px-4 py-2.5 text-gray-600 dark:text-gray-400 whitespace-nowrap max-w-[160px] truncate">
              <NuxtLink
                :to="`/tree/${entry.treeId}`"
                class="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                :title="entry.conversationTitle"
              >
                {{ entry.conversationTitle }}
              </NuxtLink>
            </td>
            <td class="px-4 py-2.5 text-gray-500 dark:text-gray-400 whitespace-nowrap text-xs font-mono">
              {{ shortModel(entry.model) }}
            </td>
            <td class="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300 whitespace-nowrap tabular-nums">
              {{ formatTokens(entry.inputTokens) }}
            </td>
            <td class="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300 whitespace-nowrap tabular-nums">
              {{ formatTokens(entry.outputTokens) }}
            </td>
            <td class="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300 whitespace-nowrap tabular-nums">
              {{ formatCost(entry.model, entry.inputTokens, entry.outputTokens) }}
            </td>
            <td class="px-4 py-2.5 text-right text-gray-400 dark:text-gray-500 whitespace-nowrap text-xs">
              {{ relativeTime(entry.createdAt) }}
            </td>
            <td class="px-4 py-2.5 text-gray-500 dark:text-gray-400 max-w-[240px] truncate text-xs">
              {{ entry.content.slice(0, 80) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
