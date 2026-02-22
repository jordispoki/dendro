<script setup lang="ts">
import { filterFreeGroups, useEnabledModelGroups } from '~/composables/useModels'

definePageMeta({ middleware: 'auth' })

const { user, clear } = useUserSession()
const { openSettings, fetchSettings } = useSettings()

const enabledModelGroups = useEnabledModelGroups()
const onlyFree = ref(false)
const visibleModelGroups = computed(() =>
  onlyFree.value ? filterFreeGroups(enabledModelGroups.value) : enabledModelGroups.value
)

const trees = ref<any[]>([])
const isCreating = ref(false)
const newTitle = ref('')
const renamingId = ref<string | null>(null)
const renameValue = ref('')

const showNewConvSettings = ref(false)
const newModel = ref('openrouter/deepseek/deepseek-chat-v3-0324')
const newVerbosity = ref('normal')

const { settings: globalSettings } = useSettings()
watch(globalSettings, (s) => {
  if (s) {
    newModel.value = s.defaultConvModel
    newVerbosity.value = s.defaultConvVerbosity
  }
}, { immediate: true })

async function fetchTrees() {
  trees.value = await $fetch('/api/trees')
}

onMounted(() => {
  fetchSettings()
  fetchTrees()
})

async function createTree() {
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
    console.error('Create tree error:', err)
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

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  navigateTo('/login')
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-950">
    <!-- Navbar -->
    <nav class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-3 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <svg class="w-6 h-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
        <span class="font-semibold text-gray-900 dark:text-white">Chat Tree</span>
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
      <!-- Create new tree -->
      <div class="mb-8">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-3">New Conversation Tree</h2>
        <div class="flex gap-2">
          <input
            v-model="newTitle"
            type="text"
            placeholder="Ask something to start exploring…"
            class="flex-1 px-4 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            @keydown.enter="createTree"
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
            @click="createTree"
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
            <!-- Model -->
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
            <!-- Verbosity -->
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

      <!-- Trees list -->
      <div>
        <h2 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
          Your Trees
        </h2>
        <div v-if="trees.length === 0" class="text-center py-12 text-gray-400 dark:text-gray-500">
          No trees yet. Create your first conversation tree above!
        </div>
        <div class="space-y-2">
          <div
            v-for="tree in trees"
            :key="tree.id"
            class="group bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 px-4 py-3 flex items-center gap-3 hover:border-indigo-200 dark:hover:border-indigo-700 transition-colors"
          >
            <NuxtLink :to="`/tree/${tree.id}`" class="flex-1 min-w-0">
              <div v-if="renamingId !== tree.id" class="flex items-center gap-2">
                <svg class="w-4 h-4 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                <span class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ tree.title }}</span>
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
            <button
              class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-all"
              title="Rename"
              @click.prevent="startRename(tree)"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </main>

    <SettingsDrawer />
  </div>
</template>
