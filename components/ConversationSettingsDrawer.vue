<script setup lang="ts">
import { useTreeStore } from '~/stores/treeStore'
import { filterFreeGroups, useEnabledModelGroups } from '~/composables/useModels'

const store = useTreeStore()
const { isConvSettingsOpen, closeConvSettings } = useConvSettings()
const router = useRouter()
const enabledModelGroups = useEnabledModelGroups()
const onlyFree = ref(false)
const visibleModelGroups = computed(() =>
  onlyFree.value ? filterFreeGroups(enabledModelGroups.value) : enabledModelGroups.value
)

const activeConv = computed(() =>
  store.activeConversationId ? store.conversationMap[store.activeConversationId] : null
)

// Context URL scraping
const contextUrlInput = ref('')
const isScrapingUrl = ref(false)
const scrapeError = ref('')

function hostname(url: string) {
  try { return new URL(url).hostname } catch { return url }
}

async function addContextUrl() {
  const url = contextUrlInput.value.trim()
  if (!url || !activeConv.value) return
  const full = url.startsWith('http') ? url : `https://${url}`
  try { new URL(full) } catch { scrapeError.value = 'Invalid URL'; return }

  isScrapingUrl.value = true
  scrapeError.value = ''
  try {
    const result = await $fetch<{ url: string; scrapedAt: string; contentLength: number }>(
      `/api/conversations/${activeConv.value.id}/context-urls`,
      { method: 'POST', body: { url: full } }
    )
    const existing = activeConv.value.contextUrls.filter((u) => u.url !== full)
    store.updateConversation(activeConv.value.id, {
      contextUrls: [...existing, { url: full, content: '', scrapedAt: result.scrapedAt }],
    })
    contextUrlInput.value = ''
  } catch (err: any) {
    scrapeError.value = err?.data?.message || 'Failed to fetch URL'
  } finally {
    isScrapingUrl.value = false
  }
}

async function removeContextUrl(url: string) {
  if (!activeConv.value) return
  try {
    await $fetch(`/api/conversations/${activeConv.value.id}/context-urls`, {
      method: 'DELETE',
      body: { url },
    })
    store.updateConversation(activeConv.value.id, {
      contextUrls: activeConv.value.contextUrls.filter((u) => u.url !== url),
    })
  } catch (err) {
    console.error('Remove context URL error:', err)
  }
}

// Aggregate all unique fetched URLs across messages in this conversation
const allFetchedUrls = computed(() => {
  if (!activeConv.value) return []
  const msgs = store.messages[activeConv.value.id] || []
  const seen = new Set<string>()
  const result: { url: string; messageId: string }[] = []
  for (const msg of msgs) {
    for (const url of (msg.fetchedUrls || [])) {
      if (!seen.has(url)) {
        seen.add(url)
        result.push({ url, messageId: msg.id })
      }
    }
  }
  return result
})

async function changeModel(newModel: string) {
  if (!activeConv.value) return
  try {
    await $fetch(`/api/conversations/${activeConv.value.id}`, {
      method: 'PATCH',
      body: { model: newModel },
    })
    store.updateConversation(activeConv.value.id, { model: newModel })
  } catch (err) {
    console.error('Change model error:', err)
  }
}

async function changeVerbosity(newVerbosity: string) {
  if (!activeConv.value) return
  try {
    await $fetch(`/api/conversations/${activeConv.value.id}`, {
      method: 'PATCH',
      body: { verbosity: newVerbosity },
    })
    store.updateConversation(activeConv.value.id, { verbosity: newVerbosity })
  } catch (err) {
    console.error('Change verbosity error:', err)
  }
}

const isDeleting = ref(false)

async function handleDelete() {
  if (!activeConv.value || isDeleting.value) return

  const isRoot = !activeConv.value.parentId
  if (!confirm('Are you sure you want to delete this conversation and all its descendants?')) return

  isDeleting.value = true
  const id = activeConv.value.id
  try {
    await $fetch(`/api/conversations/${id}`, {
      method: 'PATCH',
      body: { deletedAt: new Date().toISOString() },
    })
    closeConvSettings()
    store.softDeleteConversation(id)
    if (isRoot) {
      router.push('/')
    }
  } catch (err) {
    console.error('Delete error:', err)
  } finally {
    isDeleting.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div v-if="isConvSettingsOpen" class="fixed inset-0 z-40 bg-black/40" @click="closeConvSettings()" />
    </Transition>

    <Transition
      enter-active-class="transition-transform duration-200 ease-out"
      enter-from-class="translate-x-full"
      enter-to-class="translate-x-0"
      leave-active-class="transition-transform duration-200 ease-in"
      leave-from-class="translate-x-0"
      leave-to-class="translate-x-full"
    >
      <div
        v-if="isConvSettingsOpen && activeConv"
        class="fixed top-0 right-0 z-50 h-full w-full max-w-xs bg-white dark:bg-gray-900 shadow-2xl flex flex-col"
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 class="text-sm font-semibold text-gray-900 dark:text-white truncate max-w-[200px]">{{ activeConv.title }}</h2>
          <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 shrink-0" @click="closeConvSettings()">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          <!-- Model -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Model</label>
              <label class="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 cursor-pointer select-none">
                <input v-model="onlyFree" type="checkbox" class="w-3 h-3 accent-indigo-600" />
                Free only
              </label>
            </div>
            <select
              :value="activeConv.model"
              class="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              @change="changeModel(($event.target as HTMLSelectElement).value)"
            >
              <optgroup v-for="group in visibleModelGroups" :key="group.label" :label="group.label">
                <option v-for="m in group.models" :key="m.value" :value="m.value">{{ m.label }}</option>
              </optgroup>
            </select>
          </div>

          <!-- Verbosity -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Response length</label>
            <select
              :value="activeConv.verbosity"
              class="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              @change="changeVerbosity(($event.target as HTMLSelectElement).value)"
            >
              <option value="concise">Concise</option>
              <option value="normal">Normal</option>
              <option value="detailed">Detailed</option>
            </select>
          </div>

          <!-- Context URLs -->
          <div>
            <div class="flex items-center gap-2 mb-2">
              <svg class="w-4 h-4 text-indigo-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 004 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Context URLs</label>
              <span v-if="activeConv?.contextUrls?.length" class="text-xs text-indigo-500 font-medium">{{ activeConv.contextUrls.length }}</span>
            </div>
            <p class="text-xs text-gray-400 dark:text-gray-500 mb-3">
              Scraped content included in every LLM call for this conversation.
            </p>

            <!-- Add URL input -->
            <div class="flex gap-2 mb-2">
              <input
                v-model="contextUrlInput"
                type="text"
                placeholder="https://…"
                :disabled="isScrapingUrl"
                class="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                @keydown.enter.prevent="addContextUrl"
              />
              <button
                :disabled="!contextUrlInput.trim() || isScrapingUrl"
                class="shrink-0 px-2.5 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg transition-colors flex items-center gap-1"
                @click="addContextUrl"
              >
                <svg v-if="isScrapingUrl" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {{ isScrapingUrl ? 'Scraping…' : 'Add' }}
              </button>
            </div>
            <p v-if="scrapeError" class="text-xs text-red-500 mb-2">{{ scrapeError }}</p>

            <!-- Context URL chips -->
            <ul v-if="activeConv?.contextUrls?.length" class="space-y-1.5">
              <li
                v-for="item in activeConv.contextUrls"
                :key="item.url"
                class="flex items-start gap-2 group"
              >
                <svg class="w-3 h-3 mt-0.5 text-indigo-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <circle cx="10" cy="10" r="4" />
                </svg>
                <div class="flex-1 min-w-0">
                  <a
                    :href="item.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline break-all leading-relaxed"
                    :title="item.url"
                  >
                    {{ hostname(item.url) }}<span class="text-gray-400 dark:text-gray-500">{{ new URL(item.url).pathname === '/' ? '' : new URL(item.url).pathname }}</span>
                  </a>
                  <div class="text-xs text-gray-400 dark:text-gray-500">
                    Scraped {{ new Date(item.scrapedAt).toLocaleDateString() }}
                  </div>
                </div>
                <button
                  class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all shrink-0 mt-0.5"
                  title="Remove"
                  @click="removeContextUrl(item.url)"
                >
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </li>
            </ul>
            <p v-else class="text-xs text-gray-400 dark:text-gray-500">No context URLs yet.</p>
          </div>

          <!-- Fetched URLs -->
          <div>
            <div class="flex items-center gap-2 mb-2">
              <svg class="w-4 h-4 text-sky-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Fetched URLs</label>
              <span v-if="allFetchedUrls.length" class="text-xs text-sky-500 font-medium">{{ allFetchedUrls.length }}</span>
            </div>

            <div v-if="allFetchedUrls.length === 0" class="text-xs text-gray-400 dark:text-gray-500">
              No URLs fetched in this conversation yet.
            </div>

            <ul v-else class="space-y-1.5">
              <li
                v-for="item in allFetchedUrls"
                :key="item.url"
                class="flex items-start gap-2 group"
              >
                <svg class="w-3 h-3 mt-0.5 text-sky-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <circle cx="10" cy="10" r="4" />
                </svg>
                <a
                  :href="item.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-xs text-sky-600 dark:text-sky-400 hover:underline break-all leading-relaxed"
                  :title="item.url"
                >
                  {{ hostname(item.url) }}<span class="text-gray-400 dark:text-gray-500">{{ new URL(item.url).pathname === '/' ? '' : new URL(item.url).pathname }}</span>
                </a>
              </li>
            </ul>
          </div>

          <!-- Delete -->
          <div class="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <button
              :disabled="isDeleting"
              class="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-700"
              @click="handleDelete"
            >
              <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              {{ isDeleting ? 'Deleting…' : 'Delete conversation' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
