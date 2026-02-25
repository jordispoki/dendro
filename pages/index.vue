<script setup lang="ts">
import { filterFreeGroups, useEnabledModelGroups } from '~/composables/useModels'

definePageMeta({ middleware: 'auth' })

const { user, clear } = useUserSession()
const { openSettings, fetchSettings, settings, isLoaded } = useSettings()

const enabledModelGroups = useEnabledModelGroups()
const onlyFree = ref(false)
const visibleModelGroups = computed(() =>
  onlyFree.value ? filterFreeGroups(enabledModelGroups.value) : enabledModelGroups.value
)

const dendros = ref<any[]>([])
const isCreating = ref(false)
const newTitle = ref('')
const renamingId = ref<string | null>(null)
const renameValue = ref('')

const showNewConvSettings = ref(false)
const newModel = ref('openrouter/deepseek/deepseek-chat-v3-0324')
const newVerbosity = ref('normal')

const homeLayout = computed(() => settings.value?.homeLayout ?? 'select')
const sidebarCollapsed = ref(false)

const { dangerMode } = useConvSettings()

watch(settings, (s) => {
  if (s) {
    newModel.value = s.defaultConvModel
    newVerbosity.value = s.defaultConvVerbosity
  }
}, { immediate: true })

async function fetchDendros() {
  dendros.value = await $fetch('/api/trees')
}

onMounted(() => {
  fetchSettings()
  fetchDendros()
})

async function createDendro() {
  const message = newTitle.value.trim()
  if (!message) return
  const title = message.length > 60 ? message.slice(0, 60) + '…' : message
  isCreating.value = true
  try {
    const tree = await $fetch<any>('/api/trees', {
      method: 'POST',
      body: { title, model: newModel.value, verbosity: newVerbosity.value },
    })
    newTitle.value = ''
    navigateTo({ path: `/tree/${tree.id}`, query: { m: message } })
  } catch (err) {
    console.error('Create dendro error:', err)
  } finally {
    isCreating.value = false
  }
}

function startRename(tree: any) {
  renamingId.value = tree.id
  renameValue.value = tree.title
}

async function saveRename(tree: any) {
  const title = renameValue.value.trim()
  if (!title || title === tree.title) {
    renamingId.value = null
    return
  }
  try {
    await $fetch(`/api/trees/${tree.id}`, {
      method: 'PATCH',
      body: { title },
    })
    tree.title = title
  } catch (err) {
    console.error('Rename error:', err)
  } finally {
    renamingId.value = null
  }
}

async function togglePin(tree: any, event: MouseEvent) {
  event.preventDefault()
  const pinnedAt = tree.pinnedAt ? null : new Date().toISOString()
  try {
    await $fetch(`/api/trees/${tree.id}`, {
      method: 'PATCH',
      body: { pinnedAt },
    })
    tree.pinnedAt = pinnedAt
    // Re-sort: pinned items to top
    dendros.value = [
      ...dendros.value.filter((t) => t.pinnedAt),
      ...dendros.value.filter((t) => !t.pinnedAt),
    ]
  } catch (err) {
    console.error('Pin error:', err)
  }
}

async function deleteDendro(tree: any, event: MouseEvent) {
  event.preventDefault()
  const label = dangerMode.value ? 'permanently delete' : 'delete'
  const extra = dangerMode.value ? ' This cannot be undone.' : ''
  if (!confirm(`Are you sure you want to ${label} "${tree.title}"?${extra}`)) return
  try {
    if (dangerMode.value) {
      await $fetch(`/api/trees/${tree.id}`, { method: 'DELETE' })
    } else {
      await $fetch(`/api/trees/${tree.id}`, {
        method: 'PATCH',
        body: { deletedAt: new Date().toISOString() },
      })
    }
    dendros.value = dendros.value.filter((t) => t.id !== tree.id)
  } catch (err) {
    console.error('Delete dendro error:', err)
  }
}

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  navigateTo('/login')
}
</script>

<template>
  <!-- Wait for settings to avoid layout flash -->
  <div v-if="!isLoaded" class="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
    <svg class="w-5 h-5 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  </div>

  <!-- ── SELECT LAYOUT ────────────────────────────────────────────── -->
  <div v-else-if="homeLayout === 'select'" class="flex h-screen overflow-hidden">
    <!-- Background image -->
    <div
      class="absolute inset-0 bg-cover bg-center bg-no-repeat"
      style="background-image: url('/dendro.png')"
    />
    <!-- Overlay for readability -->
    <div class="absolute inset-0 bg-black/50 dark:bg-black/65" />

    <!-- Left sidebar -->
    <aside
      :class="['relative z-10 flex flex-col shrink-0 h-full bg-black/40 dark:bg-black/60 backdrop-blur-sm border-r border-white/10 transition-all duration-300 overflow-hidden', sidebarCollapsed ? 'w-12' : 'w-72']"
    >
      <!-- Brand / collapse toggle -->
      <div class="flex items-center border-b border-white/10 shrink-0" :class="sidebarCollapsed ? 'justify-center px-0 py-4' : 'gap-2.5 px-5 py-4'">
        <button
          class="flex items-center gap-2.5 text-left w-full min-w-0"
          :title="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
          @click="sidebarCollapsed = !sidebarCollapsed"
        >
          <svg class="w-5 h-5 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          <span v-if="!sidebarCollapsed" class="font-semibold text-white text-sm tracking-wide truncate">Dendro</span>
        </button>
      </div>

      <!-- Dendros list (hidden when collapsed) -->
      <div v-if="!sidebarCollapsed" class="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        <p v-if="dendros.length === 0" class="text-xs text-white/40 px-2 py-4 text-center">
          No dendros yet. Start one →
        </p>
        <div
          v-for="tree in dendros"
          :key="tree.id"
          class="group rounded-lg px-3 py-2 hover:bg-white/10 transition-colors cursor-pointer"
        >
          <NuxtLink :to="`/tree/${tree.id}`" class="block min-w-0">
            <div v-if="renamingId !== tree.id" class="flex items-center gap-2">
              <svg class="w-3.5 h-3.5 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              <span class="text-sm text-white/90 truncate flex-1">{{ tree.title }}</span>
              <!-- Pin button -->
              <button
                :class="[
                  'transition-all shrink-0',
                  tree.pinnedAt
                    ? 'text-amber-400 hover:text-amber-300'
                    : 'opacity-0 group-hover:opacity-100 text-white/40 hover:text-amber-400',
                ]"
                :title="tree.pinnedAt ? 'Unpin' : 'Pin to top'"
                @click.prevent="togglePin(tree, $event)"
              >
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              </button>
              <button
                class="opacity-0 group-hover:opacity-100 text-white/40 hover:text-white/80 transition-all shrink-0"
                title="Rename"
                @click.prevent="startRename(tree)"
              >
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button
                :class="['opacity-0 group-hover:opacity-100 transition-all shrink-0', dangerMode ? 'text-red-400 hover:text-red-300' : 'text-white/40 hover:text-red-400']"
                :title="dangerMode ? 'Permanently delete' : 'Delete'"
                @click.prevent="deleteDendro(tree, $event)"
              >
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
            <input
              v-else
              v-model="renameValue"
              class="text-sm bg-transparent border-b border-indigo-400 outline-none w-full text-white"
              @blur="saveRename(tree)"
              @keydown.enter="saveRename(tree)"
              @keydown.escape="renamingId = null"
              @click.prevent
            />
            <div class="text-xs text-white/30 mt-0.5 ml-5">
              {{ tree.conversations?.length || 0 }} conv · {{ new Date(tree.createdAt).toLocaleDateString() }}
            </div>
          </NuxtLink>
        </div>
      </div>

      <!-- Spacer when collapsed -->
      <div v-else class="flex-1" />

      <!-- Footer: user + settings -->
      <div class="border-t border-white/10 py-3 flex shrink-0" :class="sidebarCollapsed ? 'flex-col items-center gap-3 px-0' : 'items-center gap-2 px-4'">
        <span v-if="!sidebarCollapsed" class="text-xs text-white/50 truncate flex-1">{{ user?.name || user?.email }}</span>
        <NuxtLink
          to="/log"
          class="text-white/40 hover:text-white/80 transition-colors"
          title="LLM Log"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </NuxtLink>
        <NuxtLink
          to="/activity"
          class="text-white/40 hover:text-white/80 transition-colors"
          title="Activity"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </NuxtLink>
        <button
          class="text-white/40 hover:text-white/80 transition-colors"
          title="Settings"
          @click="openSettings()"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
        <button
          class="text-white/40 hover:text-red-400 transition-colors"
          :class="sidebarCollapsed ? '' : 'text-xs'"
          :title="sidebarCollapsed ? 'Sign out' : undefined"
          @click="logout"
        >
          <svg v-if="sidebarCollapsed" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span v-else>Sign out</span>
        </button>
      </div>
    </aside>

    <!-- Center: prompt input only -->
    <main class="relative z-10 flex-1 flex flex-col items-center justify-center px-8">
      <div class="w-full max-w-xl">
        <!-- Title -->
        <h1 class="text-3xl font-bold text-white mb-2 text-center tracking-tight drop-shadow">Dendro</h1>
        <p class="text-white/50 text-sm text-center mb-8">Start a new conversation to explore an idea</p>

        <!-- Input -->
        <div class="bg-white/10 dark:bg-white/5 backdrop-blur-md rounded-2xl border border-white/20 p-4 shadow-2xl">
          <textarea
            v-model="newTitle"
            rows="3"
            placeholder="Ask something to start exploring…"
            class="w-full bg-transparent text-white placeholder-white/40 text-sm resize-none outline-none"
            @keydown.enter.exact.prevent="createDendro"
          />
          <div class="flex items-center justify-between mt-3 pt-3 border-t border-white/10">
            <button
              :class="[
                'flex items-center gap-1.5 text-xs transition-colors',
                showNewConvSettings
                  ? 'text-indigo-400'
                  : 'text-white/40 hover:text-white/70',
              ]"
              @click="showNewConvSettings = !showNewConvSettings"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              Options
            </button>
            <button
              :disabled="isCreating || !newTitle.trim()"
              class="px-5 py-1.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl transition-colors"
              @click="createDendro"
            >
              {{ isCreating ? 'Starting…' : 'Start' }}
            </button>
          </div>

          <!-- Inline conversation settings -->
          <div v-if="showNewConvSettings" class="mt-3 pt-3 border-t border-white/10">
            <div class="flex items-center gap-4">
              <div class="flex-1">
                <div class="flex items-center justify-between mb-1">
                  <label class="text-xs font-medium text-white/50">Model</label>
                  <label class="flex items-center gap-1 text-xs text-white/40 cursor-pointer select-none">
                    <input v-model="onlyFree" type="checkbox" class="w-3 h-3 accent-indigo-500" />
                    Free only
                  </label>
                </div>
                <select
                  v-model="newModel"
                  class="w-full px-2.5 py-1.5 text-xs border border-white/20 rounded-lg bg-white/10 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <optgroup v-for="group in visibleModelGroups" :key="group.label" :label="group.label">
                    <option v-for="m in group.models" :key="m.value" :value="m.value">{{ m.label }}</option>
                  </optgroup>
                </select>
              </div>
              <div class="w-32">
                <label class="block text-xs font-medium text-white/50 mb-1">Length</label>
                <select
                  v-model="newVerbosity"
                  class="w-full px-2.5 py-1.5 text-xs border border-white/20 rounded-lg bg-white/10 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="concise">Concise</option>
                  <option value="normal">Normal</option>
                  <option value="detailed">Detailed</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>

  <!-- ── CLASSIC LAYOUT ──────────────────────────────────────────── -->
  <div v-else class="min-h-screen bg-gray-50 dark:bg-gray-950">
    <!-- Navbar -->
    <nav class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-3 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <svg class="w-6 h-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
        <span class="font-semibold text-gray-900 dark:text-white">Dendro</span>
      </div>
      <div class="flex items-center gap-3">
        <button
          class="text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400 transition-colors"
          title="Settings"
          @click="openSettings()"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
        <div class="text-sm text-gray-600 dark:text-gray-300">{{ user?.name || user?.email }}</div>
        <button
          class="text-sm text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
          @click="logout"
        >
          Sign out
        </button>
      </div>
    </nav>

    <main class="max-w-2xl mx-auto px-6 py-10">
      <!-- Create new dendro -->
      <div class="mb-8">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-3">New Dendro</h2>
        <div class="flex gap-2">
          <input
            v-model="newTitle"
            type="text"
            placeholder="Ask something to start exploring…"
            class="flex-1 px-4 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            @keydown.enter="createDendro"
          />
          <button
            :class="[
              'shrink-0 flex items-center justify-center w-10 h-10 rounded-xl border transition-colors',
              showNewConvSettings
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20'
                : 'border-gray-200 dark:border-gray-700 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 bg-white dark:bg-gray-800',
            ]"
            title="Conversation settings"
            @click="showNewConvSettings = !showNewConvSettings"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </button>
          <button
            :disabled="isCreating || !newTitle.trim()"
            class="shrink-0 px-5 py-2.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl transition-colors"
            @click="createDendro"
          >
            {{ isCreating ? 'Starting…' : 'Start' }}
          </button>
        </div>

        <!-- Inline conversation settings -->
        <div
          v-if="showNewConvSettings"
          class="mt-2 p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl space-y-3"
        >
          <div class="flex items-center gap-4">
            <div class="flex-1">
              <div class="flex items-center justify-between mb-1">
                <label class="text-xs font-medium text-gray-500 dark:text-gray-400">Model</label>
                <label class="flex items-center gap-1 text-xs text-gray-400 cursor-pointer select-none">
                  <input v-model="onlyFree" type="checkbox" class="w-3 h-3 accent-indigo-600" />
                  Free only
                </label>
              </div>
              <select
                v-model="newModel"
                class="w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <optgroup v-for="group in visibleModelGroups" :key="group.label" :label="group.label">
                  <option v-for="m in group.models" :key="m.value" :value="m.value">{{ m.label }}</option>
                </optgroup>
              </select>
            </div>
            <div class="w-36">
              <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Response length</label>
              <select
                v-model="newVerbosity"
                class="w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="concise">Concise</option>
                <option value="normal">Normal</option>
                <option value="detailed">Detailed</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <!-- Dendros list -->
      <div>
        <h2 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
          Your Dendros
        </h2>
        <div v-if="dendros.length === 0" class="text-center py-12 text-gray-400 dark:text-gray-500">
          No dendros yet. Create your first dendro above!
        </div>
        <div class="space-y-2">
          <div
            v-for="tree in dendros"
            :key="tree.id"
            :class="[
              'group bg-white dark:bg-gray-900 rounded-xl border px-4 py-3 flex items-center gap-3 transition-colors',
              tree.pinnedAt
                ? 'border-amber-200 dark:border-amber-800/50 hover:border-amber-300 dark:hover:border-amber-700'
                : 'border-gray-100 dark:border-gray-800 hover:border-indigo-200 dark:hover:border-indigo-700',
            ]"
          >
            <NuxtLink :to="`/tree/${tree.id}`" class="flex-1 min-w-0">
              <div v-if="renamingId !== tree.id" class="flex items-center gap-2">
                <svg class="w-4 h-4 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                <span class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ tree.title }}</span>
                <svg v-if="tree.pinnedAt" class="w-3 h-3 text-amber-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              </div>
              <input
                v-else
                v-model="renameValue"
                class="text-sm font-medium bg-transparent border-b border-indigo-500 outline-none w-full text-gray-900 dark:text-white"
                @blur="saveRename(tree)"
                @keydown.enter="saveRename(tree)"
                @keydown.escape="renamingId = null"
                @click.prevent
              />
              <div class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {{ tree.conversations?.length || 0 }} conversations ·
                {{ new Date(tree.createdAt).toLocaleDateString() }}
              </div>
            </NuxtLink>
            <!-- Pin button -->
            <button
              :class="[
                'transition-all shrink-0',
                tree.pinnedAt
                  ? 'text-amber-400 hover:text-amber-500'
                  : 'opacity-0 group-hover:opacity-100 text-gray-400 hover:text-amber-400',
              ]"
              :title="tree.pinnedAt ? 'Unpin' : 'Pin to top'"
              @click.prevent="togglePin(tree, $event)"
            >
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>
            <button
              class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-all"
              title="Rename"
              @click.prevent="startRename(tree)"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              :class="['opacity-0 group-hover:opacity-100 transition-all', dangerMode ? 'text-red-500 hover:text-red-700' : 'text-gray-400 hover:text-red-500']"
              :title="dangerMode ? 'Permanently delete' : 'Delete'"
              @click.prevent="deleteDendro(tree, $event)"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>

  <SettingsDrawer />
</template>
