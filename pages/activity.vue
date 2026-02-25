<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const route = useRoute()

interface ActivityEntry {
  id: string
  action: string
  payload: Record<string, any>
  treeId: string | null
  conversationId: string | null
  createdAt: string
}

const PAGE = 50

const entries = ref<ActivityEntry[]>([])
const isLoading = ref(true)
const isLoadingMore = ref(false)
const cursor = ref<string | null>(null)
const hasMore = ref(false)

const activityFilter = ref('all')
const selectedTreeId = ref('')
const selectedConversationId = ref('')

const trees = ref<{ id: string; title: string }[]>([])

const ACTIVITY_CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'tree', label: 'Trees' },
  { value: 'conversation', label: 'Conversations' },
  { value: 'message', label: 'Messages' },
  { value: 'command', label: 'Commands' },
  { value: 'url', label: 'URLs' },
  { value: 'summary', label: 'Summaries' },
  { value: 'context', label: 'Context' },
  { value: 'settings', label: 'Settings' },
  { value: 'file', label: 'Files' },
]

// Unique conversations seen in loaded entries — for the thread dropdown
const availableConversations = computed(() => {
  const map = new Map<string, string>()
  for (const e of entries.value) {
    if (e.conversationId) {
      const title = getConversationName(e)
      if (title) map.set(e.conversationId, title)
    }
  }
  return Array.from(map.entries())
    .map(([id, title]) => ({ id, title }))
    .sort((a, b) => a.title.localeCompare(b.title))
})

function buildParams(before?: string | null) {
  const params = new URLSearchParams()
  params.set('limit', String(PAGE))
  const prefix = activityFilter.value === 'all' ? '' : activityFilter.value
  if (prefix) params.set('action', prefix)
  if (selectedTreeId.value) params.set('treeId', selectedTreeId.value)
  if (selectedConversationId.value) params.set('conversationId', selectedConversationId.value)
  if (before) params.set('before', before)
  return params.toString()
}

async function fetchActivity() {
  isLoading.value = true
  entries.value = []
  cursor.value = null
  hasMore.value = false
  try {
    const data = await $fetch<{ entries: ActivityEntry[]; hasMore: boolean }>(
      `/api/activity?${buildParams()}`
    )
    entries.value = data.entries
    hasMore.value = data.hasMore
    cursor.value = data.entries.at(-1)?.createdAt ?? null
  } finally {
    isLoading.value = false
  }
}

async function loadMore() {
  if (!hasMore.value || isLoadingMore.value || !cursor.value) return
  isLoadingMore.value = true
  try {
    const data = await $fetch<{ entries: ActivityEntry[]; hasMore: boolean }>(
      `/api/activity?${buildParams(cursor.value)}`
    )
    entries.value.push(...data.entries)
    hasMore.value = data.hasMore
    cursor.value = data.entries.at(-1)?.createdAt ?? cursor.value
  } finally {
    isLoadingMore.value = false
  }
}

watch(activityFilter, fetchActivity)
watch(selectedTreeId, () => {
  selectedConversationId.value = ''
  fetchActivity()
})
watch(selectedConversationId, fetchActivity)

onMounted(async () => {
  // Pre-apply treeId filter from query param (e.g. linked from tree page navbar)
  if (route.query.treeId) {
    selectedTreeId.value = route.query.treeId as string
  }
  const [, allTrees] = await Promise.all([
    fetchActivity(),
    $fetch<any[]>('/api/trees'),
  ])
  trees.value = allTrees.map((t) => ({ id: t.id, title: t.title }))
  startActivityStream()
})

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

function formatBytes(n: number): string {
  if (n >= 1024) return `${(n / 1024).toFixed(1)}k`
  return `${n}b`
}

function shortModel(model: string): string {
  return model.replace('openrouter/', '').replace('google/', '').split('/').pop() || model
}

// Tree name: payload.treeTitle, or payload.title for tree.* events (tree.renamed uses p.to),
// or look up by treeId in the loaded trees list as a fallback.
function getTreeName(entry: ActivityEntry): string | null {
  const p = entry.payload
  if (p.treeTitle) return p.treeTitle as string
  if (entry.action === 'tree.renamed') return (p.to as string) || null
  if (entry.action.startsWith('tree.') && p.title) return p.title as string
  if (entry.treeId) {
    const t = trees.value.find((t) => t.id === entry.treeId)
    if (t) return t.title
  }
  return null
}

// Conversation name: payload.conversationTitle (set on all events after the fix),
// or payload.title for conversation.* events (legacy entries).
function getConversationName(entry: ActivityEntry): string | null {
  const p = entry.payload
  if (p.conversationTitle) return p.conversationTitle as string
  if (entry.action.startsWith('conversation.') && p.title) return p.title as string
  return null
}

// Build a deep link: go to the tree and, when conversationId is known, select that branch
function treeLink(entry: ActivityEntry): string | null {
  if (!entry.treeId) return null
  return entry.conversationId
    ? `/tree/${entry.treeId}?conv=${entry.conversationId}`
    : `/tree/${entry.treeId}`
}

function activityDescription(entry: ActivityEntry): string {
  const p = entry.payload
  switch (entry.action) {
    case 'tree.created':     return `Created dendro "${p.title}"`
    case 'tree.renamed':     return `Renamed "${p.from}" → "${p.to}"`
    case 'tree.deleted':     return `Deleted dendro${p.hard ? ' (permanent)' : ''}`
    case 'conversation.created':  return p.isBranch ? 'Branched conversation' : 'Created conversation'
    case 'conversation.closed':   return 'Closed conversation'
    case 'conversation.deleted':  return 'Deleted conversation'
    case 'message.sent': {
      const chars = p.inputLength >= 1000 ? `${(p.inputLength / 1000).toFixed(1)}k` : `${p.inputLength}`
      return `Sent message (${shortModel(p.model || '')}, ${chars} chars)`
    }
    case 'command.executed': {
      const cmd = (p.command || '').slice(0, 60)
      const host = p.hostLabel || 'local'
      const dur = p.durationMs != null
        ? ` ${p.durationMs < 1000 ? p.durationMs + 'ms' : (p.durationMs / 1000).toFixed(1) + 's'}`
        : ''
      const lines = p.stdoutLines ? `, ${p.stdoutLines} line${p.stdoutLines !== 1 ? 's' : ''}` : ''
      return `\`${cmd}\` on ${host} → exit ${p.exitCode}${dur}${lines}`
    }
    case 'settings.changed': {
      const fields: string[] = p.fields || []
      return `Changed settings: ${fields.join(', ')}`
    }
    case 'file.uploaded':  return `Uploaded "${p.filename}" (${formatBytes(p.size || 0)})`
    case 'file.deleted':   return `Deleted "${p.filename}"`
    case 'url.scraped': {
      let host = p.url || ''
      try { host = new URL(p.url).hostname } catch {}
      const chars = p.contentLength >= 1000 ? `${(p.contentLength / 1000).toFixed(1)}k` : `${p.contentLength}`
      return `Scraped ${host} (${chars} chars)`
    }
    case 'url.removed': {
      let host = p.url || ''
      try { host = new URL(p.url).hostname } catch {}
      return `Removed ${host}`
    }
    case 'summary.prepared': {
      return `Branch summary (${p.messageCount} msgs, ${shortModel(p.model || '')})`
    }
    case 'context.built': {
      const turnsStr = p.contextTurns ? `${p.contextTurns} turns` : ''
      const charsStr = p.contextChars
        ? `${p.contextChars >= 1000 ? (p.contextChars / 1000).toFixed(1) + 'k' : p.contextChars} chars`
        : ''
      const parts = [turnsStr, charsStr].filter(Boolean).join(', ')
      return `Built context${parts ? ` (${parts})` : ''}`
    }
    default:
      return entry.action
  }
}

function activityCategory(action: string): string {
  return action.split('.')[0]
}

const expandedId = ref<string | null>(null)

function isExpandable(action: string): boolean {
  return action === 'command.executed' || action === 'context.built'
}

function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

// null = never connected yet, true = connected, false = disconnected
const isLive = ref<boolean | null>(null)
let activitySource: EventSource | null = null

function matchesCurrentFilters(entry: ActivityEntry): boolean {
  if (activityFilter.value !== 'all' && !entry.action.startsWith(activityFilter.value)) return false
  if (selectedTreeId.value && entry.treeId !== selectedTreeId.value) return false
  if (selectedConversationId.value && entry.conversationId !== selectedConversationId.value) return false
  return true
}

function startActivityStream() {
  activitySource?.close()
  activitySource = new EventSource('/api/activity/stream')

  activitySource.onopen = async () => {
    const isReconnect = isLive.value === false
    isLive.value = true
    if (isReconnect) {
      try {
        const data = await $fetch<{ entries: ActivityEntry[]; hasMore: boolean }>(
          `/api/activity?${buildParams()}`
        )
        for (const entry of data.entries) {
          if (!entries.value.some((e) => e.id === entry.id)) {
            entries.value.unshift(entry)
          }
        }
      } catch {}
    }
  }

  activitySource.onerror = () => {
    isLive.value = false
  }

  activitySource.onmessage = (e) => {
    const entry: ActivityEntry = JSON.parse(e.data)
    if (entries.value.some((x) => x.id === entry.id)) return
    if (matchesCurrentFilters(entry)) {
      entries.value.unshift(entry)
    }
  }
}

onUnmounted(() => {
  activitySource?.close()
})
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
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span class="font-semibold text-gray-900 dark:text-white text-sm">Activity</span>
        <span v-if="isLive === true" class="ml-2 text-xs font-medium text-emerald-500 dark:text-emerald-400">● Live</span>
        <span v-else-if="isLive === false" class="ml-2 text-xs font-medium text-gray-400 dark:text-gray-500">○ Reconnecting…</span>
      </div>
      <div class="flex-1" />
    </nav>

    <!-- Filter bar: type pills -->
    <div class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-2 flex items-center gap-2 shrink-0 flex-wrap">
      <span class="text-xs text-gray-500 dark:text-gray-400 shrink-0">Type:</span>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="cat in ACTIVITY_CATEGORIES"
          :key="cat.value"
          class="px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
          :class="activityFilter === cat.value
            ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'"
          @click="activityFilter = cat.value"
        >
          {{ cat.label }}
        </button>
      </div>
    </div>

    <!-- Filter bar: dendro + thread selects -->
    <div class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-2 flex items-center gap-4 shrink-0 flex-wrap">
      <div class="flex items-center gap-1.5">
        <span class="text-xs text-gray-500 dark:text-gray-400 shrink-0">Dendro:</span>
        <select
          v-model="selectedTreeId"
          class="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All</option>
          <option v-for="t in trees" :key="t.id" :value="t.id">{{ t.title }}</option>
        </select>
      </div>

      <div class="flex items-center gap-1.5">
        <span class="text-xs text-gray-500 dark:text-gray-400 shrink-0">Thread:</span>
        <select
          v-model="selectedConversationId"
          :disabled="availableConversations.length === 0"
          class="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-40"
        >
          <option value="">All</option>
          <option v-for="c in availableConversations" :key="c.id" :value="c.id">{{ c.title }}</option>
        </select>
      </div>

      <!-- Active filter chips -->
      <template v-if="selectedTreeId || selectedConversationId">
        <div class="ml-auto flex items-center gap-1.5">
          <button
            v-if="selectedTreeId"
            class="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
            @click="selectedTreeId = ''"
          >
            {{ trees.find(t => t.id === selectedTreeId)?.title || 'Dendro' }}
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <button
            v-if="selectedConversationId"
            class="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
            @click="selectedConversationId = ''"
          >
            {{ availableConversations.find(c => c.id === selectedConversationId)?.title || 'Thread' }}
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </template>
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

      <div v-else-if="entries.length === 0" class="text-center py-20 text-gray-400 dark:text-gray-500">
        No activity recorded yet.
      </div>

      <template v-else>
        <table class="w-full text-sm border-collapse">
          <thead class="sticky top-0 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
            <tr>
              <th class="text-left px-4 py-2.5 font-medium text-gray-500 dark:text-gray-400">Event</th>
              <th class="text-left px-4 py-2.5 font-medium text-gray-500 dark:text-gray-400 w-36 whitespace-nowrap">Dendro</th>
              <th class="text-left px-4 py-2.5 font-medium text-gray-500 dark:text-gray-400 w-40 whitespace-nowrap">Thread</th>
              <th class="text-right px-4 py-2.5 font-medium text-gray-500 dark:text-gray-400 w-20 whitespace-nowrap">Age</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="(entry, index) in entries" :key="entry.id">
              <!-- Main row -->
              <tr
                class="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
                :class="[isExpandable(entry.action) ? 'cursor-pointer' : '', index === 0 && isLive ? 'entry-flash' : '']"
                @click="isExpandable(entry.action) ? toggleExpand(entry.id) : undefined"
              >
                <!-- Event cell: icon + description -->
                <td class="px-4 py-2.5">
                  <div class="flex items-center gap-2.5">
                    <!-- Category icon -->
                    <div class="shrink-0 w-6 h-6 rounded-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
                      <template v-if="activityCategory(entry.action) === 'tree'">
                        <svg class="w-3 h-3 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                      </template>
                      <template v-else-if="activityCategory(entry.action) === 'conversation'">
                        <svg class="w-3 h-3 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                      </template>
                      <template v-else-if="activityCategory(entry.action) === 'message'">
                        <svg class="w-3 h-3 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                      </template>
                      <template v-else-if="activityCategory(entry.action) === 'command'">
                        <svg class="w-3 h-3 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </template>
                      <template v-else-if="activityCategory(entry.action) === 'url' || activityCategory(entry.action) === 'summary' || activityCategory(entry.action) === 'context'">
                        <svg class="w-3 h-3 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
                        </svg>
                      </template>
                      <template v-else-if="activityCategory(entry.action) === 'settings'">
                        <svg class="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </template>
                      <template v-else-if="activityCategory(entry.action) === 'file'">
                        <svg class="w-3 h-3 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </template>
                      <template v-else>
                        <svg class="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </template>
                    </div>

                    <!-- Description text -->
                    <span class="text-gray-700 dark:text-gray-300 leading-snug">
                      {{ activityDescription(entry) }}
                    </span>

                    <!-- Expand indicator -->
                    <svg
                      v-if="isExpandable(entry.action)"
                      class="ml-auto shrink-0 w-3.5 h-3.5 text-gray-400 transition-transform"
                      :class="expandedId === entry.id ? 'rotate-180' : ''"
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </td>

                <!-- Dendro column -->
                <td class="px-4 py-2.5 w-36">
                  <NuxtLink
                    v-if="getTreeName(entry) && treeLink(entry)"
                    :to="treeLink(entry)!"
                    class="block truncate text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
                    :title="getTreeName(entry) ?? undefined"
                    @click.stop
                  >
                    {{ getTreeName(entry) }}
                  </NuxtLink>
                  <span
                    v-else-if="getTreeName(entry)"
                    class="block truncate text-xs text-amber-600 dark:text-amber-400"
                    :title="getTreeName(entry) ?? undefined"
                  >
                    {{ getTreeName(entry) }}
                  </span>
                  <span v-else class="text-xs text-gray-300 dark:text-gray-600">—</span>
                </td>

                <!-- Thread column -->
                <td class="px-4 py-2.5 w-40">
                  <NuxtLink
                    v-if="getConversationName(entry) && treeLink(entry)"
                    :to="treeLink(entry)!"
                    class="block truncate text-xs text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 transition-colors"
                    :title="getConversationName(entry) ?? undefined"
                    @click.stop
                  >
                    {{ getConversationName(entry) }}
                  </NuxtLink>
                  <span
                    v-else-if="getConversationName(entry)"
                    class="block truncate text-xs text-blue-500 dark:text-blue-400"
                    :title="getConversationName(entry) ?? undefined"
                  >
                    {{ getConversationName(entry) }}
                  </span>
                  <span v-else class="text-xs text-gray-300 dark:text-gray-600">—</span>
                </td>

                <!-- Age column -->
                <td class="px-4 py-2.5 text-right text-xs text-gray-400 dark:text-gray-500 tabular-nums whitespace-nowrap w-20">
                  {{ relativeTime(entry.createdAt) }}
                </td>
              </tr>

              <!-- Detail panel: command.executed -->
              <tr v-if="entry.action === 'command.executed' && expandedId === entry.id">
                <td colspan="4" class="px-4 pb-3">
                  <div class="ml-8 rounded-lg bg-gray-950 dark:bg-black text-gray-200 text-xs font-mono overflow-hidden">
                    <div v-if="entry.payload.stdoutPreview" class="p-3">
                      <div class="text-gray-500 mb-1 text-[10px] uppercase tracking-wide">stdout</div>
                      <pre class="whitespace-pre-wrap break-all leading-relaxed">{{ entry.payload.stdoutPreview }}{{ entry.payload.stdoutLines > entry.payload.stdoutPreview?.split('\n').length ? '\n…' : '' }}</pre>
                    </div>
                    <div v-if="entry.payload.stderrPreview" class="p-3 border-t border-gray-800">
                      <div class="text-red-400 mb-1 text-[10px] uppercase tracking-wide">stderr</div>
                      <pre class="whitespace-pre-wrap break-all leading-relaxed text-red-300">{{ entry.payload.stderrPreview }}</pre>
                    </div>
                    <div v-if="!entry.payload.stdoutPreview && !entry.payload.stderrPreview" class="p-3 text-gray-600 italic">
                      (no output)
                    </div>
                  </div>
                </td>
              </tr>

              <!-- Detail panel: context.built -->
              <tr v-if="entry.action === 'context.built' && expandedId === entry.id">
                <td colspan="4" class="px-4 pb-3">
                  <dl class="ml-8 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-xs bg-gray-50 dark:bg-gray-900 rounded-lg px-3 py-2.5 border border-gray-100 dark:border-gray-800">
                    <div class="flex justify-between gap-2">
                      <dt class="text-gray-400">Turns sent</dt>
                      <dd class="font-medium text-gray-700 dark:text-gray-300 tabular-nums">{{ entry.payload.contextTurns ?? '—' }}</dd>
                    </div>
                    <div class="flex justify-between gap-2">
                      <dt class="text-gray-400">Total chars</dt>
                      <dd class="font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                        {{ entry.payload.contextChars >= 1000 ? (entry.payload.contextChars / 1000).toFixed(1) + 'k' : entry.payload.contextChars ?? '—' }}
                      </dd>
                    </div>
                    <div class="flex justify-between gap-2">
                      <dt class="text-gray-400">Ctx URLs</dt>
                      <dd class="font-medium text-gray-700 dark:text-gray-300 tabular-nums">{{ entry.payload.contextUrlCount ?? 0 }}</dd>
                    </div>
                    <div class="flex justify-between gap-2">
                      <dt class="text-gray-400">Auto-fetched</dt>
                      <dd class="font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                        {{ entry.payload.fetchedUrlCount ?? 0 }}
                        <span v-if="entry.payload.failedUrlCount" class="text-red-400">({{ entry.payload.failedUrlCount }} failed)</span>
                      </dd>
                    </div>
                    <div class="flex justify-between gap-2">
                      <dt class="text-gray-400">Attachments</dt>
                      <dd class="font-medium text-gray-700 dark:text-gray-300 tabular-nums">{{ entry.payload.attachmentCount ?? 0 }}</dd>
                    </div>
                    <div class="flex justify-between gap-2">
                      <dt class="text-gray-400">Branch ctx</dt>
                      <dd class="font-medium text-gray-700 dark:text-gray-300">{{ entry.payload.hasBranchSummary ? 'yes' : 'no' }}</dd>
                    </div>
                    <div v-if="entry.payload.attachmentNames?.length" class="col-span-2 sm:col-span-3 flex gap-2 pt-0.5">
                      <dt class="text-gray-400 shrink-0">Files</dt>
                      <dd class="text-gray-600 dark:text-gray-400 truncate">{{ entry.payload.attachmentNames.join(', ') }}</dd>
                    </div>
                  </dl>
                </td>
              </tr>
            </template>
          </tbody>
        </table>

        <!-- Load more -->
        <div class="flex items-center justify-center py-6 border-t border-gray-100 dark:border-gray-800">
          <button
            v-if="hasMore"
            class="px-4 py-2 text-sm font-medium rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            :disabled="isLoadingMore"
            @click="loadMore"
          >
            <span v-if="isLoadingMore" class="flex items-center gap-2">
              <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading…
            </span>
            <span v-else>Load more</span>
          </button>
          <span v-else class="text-xs text-gray-400 dark:text-gray-500">All entries loaded</span>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
@keyframes entry-flash {
  0%   { background-color: rgb(254 249 195); }
  100% { background-color: transparent; }
}
.entry-flash {
  animation: entry-flash 1.2s ease-out;
}
</style>
