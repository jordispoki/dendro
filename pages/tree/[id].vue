<script setup lang="ts">
import { useTreeStore } from '~/stores/treeStore'
import { useConversationTree } from '~/composables/useConversationTree'
import { useLLM } from '~/composables/useLLM'
import { useProjectFiles } from '~/composables/useProjectFiles'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const store = useTreeStore()
const { visibleColumns } = useConversationTree()
const { openSettings, fetchSettings } = useSettings()
const { openConvSettings } = useConvSettings()
const { fetchFiles, openFiles } = useProjectFiles()
const { user, clear } = useUserSession()
const { sendMessage } = useLLM()
const router = useRouter()

const treeId = computed(() => route.params.id as string)
const isLoading = ref(true)
const treeTitle = ref('')
const isRenamingTree = ref(false)
const renameTreeValue = ref('')

// Active conversation
const activeConversation = computed(() =>
  store.activeConversationId ? store.conversationMap[store.activeConversationId] : null
)
const isRenamingConv = ref(false)
const renameConvValue = ref('')

watch(() => store.activeConversationId, () => {
  isRenamingConv.value = false
})

onMounted(async () => {
  fetchSettings()
  store.reset()
  try {
    const tree = await $fetch<any>(`/api/trees/${treeId.value}`)
    treeTitle.value = tree.title
    store.loadTree(tree)
    fetchFiles(treeId.value)

    isLoading.value = false

    // Deep-link to a specific conversation (e.g. from activity log)
    const targetConvId = route.query.conv as string | undefined
    if (targetConvId && store.conversationMap[targetConvId]) {
      store.setActiveConversation(targetConvId)
      router.replace({ path: route.path })
    }

    const initialMessage = route.query.m as string | undefined
    if (initialMessage && store.activeConversationId) {
      router.replace({ path: route.path })
      await sendMessage(store.activeConversationId, initialMessage)
    }
  } catch (err) {
    console.error('Load tree error:', err)
    isLoading.value = false
    navigateTo('/')
  }
})

async function saveTreeRename() {
  const title = renameTreeValue.value.trim()
  if (!title || title === treeTitle.value) {
    isRenamingTree.value = false
    return
  }
  try {
    await $fetch(`/api/trees/${treeId.value}`, {
      method: 'PATCH',
      body: { title },
    })
    treeTitle.value = title
  } catch (err) {
    console.error('Rename tree error:', err)
  } finally {
    isRenamingTree.value = false
  }
}

async function saveConvRename() {
  const title = renameConvValue.value.trim()
  if (!title || !activeConversation.value || title === activeConversation.value.title) {
    isRenamingConv.value = false
    return
  }
  try {
    await $fetch(`/api/conversations/${activeConversation.value.id}`, {
      method: 'PATCH',
      body: { title },
    })
    store.updateConversation(activeConversation.value.id, { title })
  } catch (err) {
    console.error('Rename conv error:', err)
  } finally {
    isRenamingConv.value = false
  }
}

async function closeActiveConversation() {
  if (!activeConversation.value) return
  try {
    await $fetch(`/api/conversations/${activeConversation.value.id}`, {
      method: 'PATCH',
      body: { closedAt: new Date().toISOString() },
    })
    store.closeConversation(activeConversation.value.id)
  } catch (err) {
    console.error('Close error:', err)
  }
}

async function deleteActiveConversation() {
  if (!activeConversation.value) return
  if (!confirm('Are you sure you want to delete this conversation and all its descendants?')) return

  const id = activeConversation.value.id
  const isRoot = !activeConversation.value.parentId
  try {
    await $fetch(`/api/conversations/${id}`, {
      method: 'PATCH',
      body: { deletedAt: new Date().toISOString() },
    })
    store.softDeleteConversation(id)
    if (isRoot) navigateTo('/')
  } catch (err) {
    console.error('Delete error:', err)
  }
}

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  navigateTo('/login')
}
</script>

<template>
  <div class="flex flex-col h-screen bg-white dark:bg-gray-950 overflow-hidden">
    <!-- Unified Navbar -->
    <nav class="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0">
      <!-- Back -->
      <NuxtLink
        to="/"
        class="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors shrink-0"
        title="Back to dendros"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
      </NuxtLink>

      <!-- Tree title (inline rename) -->
      <div class="shrink-0">
        <input
          v-if="isRenamingTree"
          v-model="renameTreeValue"
          class="text-sm font-semibold bg-transparent border-b border-indigo-500 outline-none text-gray-900 dark:text-white w-32"
          @blur="saveTreeRename"
          @keydown.enter="saveTreeRename"
          @keydown.escape="isRenamingTree = false"
        />
        <button
          v-else
          class="text-sm font-semibold text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          @click="renameTreeValue = treeTitle; isRenamingTree = true"
        >
          {{ treeTitle }}
        </button>
      </div>

      <!-- Separator + Active conversation title -->
      <template v-if="activeConversation && !isLoading">
        <span class="text-gray-300 dark:text-gray-700 shrink-0 select-none">/</span>
        <div class="flex-1 min-w-0">
          <input
            v-if="isRenamingConv"
            v-model="renameConvValue"
            class="text-sm bg-transparent border-b border-indigo-500 outline-none text-gray-900 dark:text-white w-full max-w-xs"
            @blur="saveConvRename"
            @keydown.enter="saveConvRename"
            @keydown.escape="isRenamingConv = false"
          />
          <button
            v-else
            class="text-sm text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors truncate max-w-xs block text-left"
            @click="renameConvValue = activeConversation.title; isRenamingConv = true"
          >
            {{ activeConversation.title }}
          </button>
        </div>
      </template>
      <div v-else class="flex-1" />

      <!-- Close branch (only for branch conversations) -->
      <button
        v-if="activeConversation?.parentId"
        class="text-gray-400 hover:text-amber-500 transition-colors shrink-0"
        title="Close branch"
        @click="closeActiveConversation"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
      </button>

      <!-- Dendro Context -->
      <button
        class="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors shrink-0"
        title="Dendro Context"
        @click="openFiles()"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
        </svg>
      </button>

      <!-- Conversation settings -->
      <button
        class="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors shrink-0"
        title="Conversation settings"
        @click="openConvSettings()"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      </button>

      <!-- Activity log -->
      <NuxtLink
        :to="`/activity?treeId=${treeId}`"
        class="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors shrink-0"
        title="Activity"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </NuxtLink>

      <!-- LLM log -->
      <NuxtLink
        :to="`/log?dendro=${treeId}`"
        class="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors shrink-0"
        title="LLM Log"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      </NuxtLink>

      <!-- Global settings -->
      <button
        class="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors shrink-0"
        title="Settings"
        @click="openSettings()"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      <span class="text-sm text-gray-500 dark:text-gray-400 hidden sm:block shrink-0">{{ user?.name || user?.email }}</span>
    </nav>

    <!-- Loading -->
    <div v-if="isLoading" class="flex-1 flex items-center justify-center">
      <div class="flex items-center gap-3 text-gray-400">
        <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading tree…
      </div>
    </div>

    <!-- Column layout -->
    <div
      v-else
      class="flex-1 flex overflow-x-auto overflow-y-hidden"
    >
      <ConversationColumn
        v-for="col in visibleColumns"
        :key="col.conversation.id"
        :conversation="col.conversation"
        :role="col.role"
      />

      <!-- Empty state -->
      <div
        v-if="visibleColumns.length === 0"
        class="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500"
      >
        No conversations found.
      </div>
    </div>

    <!-- Branch preview modal -->
    <BranchPreviewModal />

    <!-- Minimap (client-only to avoid SSR hydration mismatch with Transition+v-if) -->
    <ClientOnly>
      <GitMinimap />
    </ClientOnly>

    <!-- Conversation settings drawer -->
    <ConversationSettingsDrawer />

    <!-- Settings drawer -->
    <SettingsDrawer />

    <!-- Project files drawer -->
    <ProjectFilesDrawer :tree-id="treeId" />
  </div>
</template>
