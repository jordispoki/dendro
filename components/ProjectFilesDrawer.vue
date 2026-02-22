<script setup lang="ts">
import { useProjectFiles } from '~/composables/useProjectFiles'
import { useTreeStore } from '~/stores/treeStore'

const props = defineProps<{ treeId: string }>()

const { files, contextUrls, isFilesOpen, addFile, deleteFile, addContextUrl, removeContextUrl, closeFiles } = useProjectFiles()
const store = useTreeStore()

// ── Project Files ──────────────────────────────────────────
const showAddForm = ref(false)
const newFileName = ref('')
const newFileContent = ref('')
const addFileError = ref('')
const isSaving = ref(false)
const addFileInputRef = ref<HTMLInputElement | null>(null)

function openAddForm() {
  showAddForm.value = true
  newFileName.value = ''
  newFileContent.value = ''
  addFileError.value = ''
}

function handleFilePickerChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files?.[0]) return
  const file = input.files[0]
  newFileName.value = file.name
  const reader = new FileReader()
  reader.onload = (ev) => { newFileContent.value = ev.target?.result as string }
  reader.readAsText(file)
  input.value = ''
}

async function handleAdd() {
  if (!newFileName.value.trim()) { addFileError.value = 'File name required'; return }
  if (!newFileContent.value.trim()) { addFileError.value = 'Content required'; return }
  isSaving.value = true
  addFileError.value = ''
  try {
    await addFile(props.treeId, newFileName.value.trim(), newFileContent.value)
    showAddForm.value = false
  } catch (err: any) {
    addFileError.value = err?.data?.message ?? 'Failed to save'
  } finally {
    isSaving.value = false
  }
}

async function handleDeleteFile(fileId: string) {
  await deleteFile(props.treeId, fileId)
}

// ── Context URLs ────────────────────────────────────────────
const urlInput = ref('')
const isScrapingUrl = ref(false)
const scrapeError = ref('')

// All unique URLs fetched across messages in this tree's conversations
const allFetchedUrls = computed(() => {
  const seen = new Set<string>()
  const result: string[] = []
  for (const msgs of Object.values(store.messages)) {
    for (const msg of msgs) {
      for (const url of (msg.fetchedUrls || [])) {
        if (!seen.has(url)) { seen.add(url); result.push(url) }
      }
    }
  }
  return result
})

function hostname(url: string) {
  try { return new URL(url).hostname } catch { return url }
}

function pathPart(url: string) {
  try {
    const p = new URL(url).pathname
    return p === '/' ? '' : p
  } catch { return '' }
}

async function handleAddUrl() {
  const raw = urlInput.value.trim()
  if (!raw) return
  const url = raw.startsWith('http') ? raw : `https://${raw}`
  try { new URL(url) } catch { scrapeError.value = 'Invalid URL'; return }

  isScrapingUrl.value = true
  scrapeError.value = ''
  try {
    await addContextUrl(props.treeId, url)
    urlInput.value = ''
  } catch (err: any) {
    scrapeError.value = err?.data?.message || 'Failed to fetch URL'
  } finally {
    isScrapingUrl.value = false
  }
}

async function handleRemoveUrl(url: string) {
  await removeContextUrl(props.treeId, url)
}
</script>

<template>
  <Teleport to="body">
    <!-- Backdrop -->
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div v-if="isFilesOpen" class="fixed inset-0 z-40 bg-black/40" @click="closeFiles()" />
    </Transition>

    <!-- Drawer -->
    <Transition
      enter-active-class="transition-transform duration-200 ease-out"
      enter-from-class="translate-x-full"
      enter-to-class="translate-x-0"
      leave-active-class="transition-transform duration-200 ease-in"
      leave-from-class="translate-x-0"
      leave-to-class="translate-x-full"
    >
      <div
        v-if="isFilesOpen"
        class="fixed top-0 right-0 z-50 h-full w-full max-w-sm bg-white dark:bg-gray-900 shadow-2xl flex flex-col"
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <h2 class="text-sm font-semibold text-gray-900 dark:text-white">Dendro Context</h2>
          <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" @click="closeFiles()">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Scrollable content -->
        <div class="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">

          <!-- ── URLs section ────────────────────────────── -->
          <div class="px-6 py-5 space-y-3">
            <div class="flex items-center gap-2">
              <svg class="w-4 h-4 text-sky-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 004 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">URLs</h3>
              <span v-if="contextUrls.length" class="text-xs text-sky-500 font-medium">{{ contextUrls.length }} pinned</span>
            </div>
            <p class="text-xs text-gray-400 dark:text-gray-500">Pinned URLs are scraped and injected into every LLM call for this dendro.</p>

            <!-- Add URL -->
            <div class="flex gap-2">
              <input
                v-model="urlInput"
                type="text"
                placeholder="https://…"
                :disabled="isScrapingUrl"
                class="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50"
                @keydown.enter.prevent="handleAddUrl"
              />
              <button
                :disabled="!urlInput.trim() || isScrapingUrl"
                class="shrink-0 px-2.5 py-1.5 text-xs font-medium bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white rounded-lg transition-colors flex items-center gap-1"
                @click="handleAddUrl"
              >
                <svg v-if="isScrapingUrl" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {{ isScrapingUrl ? 'Scraping…' : 'Pin' }}
              </button>
            </div>
            <p v-if="scrapeError" class="text-xs text-red-500">{{ scrapeError }}</p>

            <!-- Pinned URLs -->
            <div v-if="contextUrls.length" class="space-y-1.5">
              <div
                v-for="item in contextUrls"
                :key="item.url"
                class="flex items-center gap-2 group py-1"
              >
                <svg class="w-3 h-3 text-sky-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <circle cx="10" cy="10" r="4" />
                </svg>
                <div class="flex-1 min-w-0">
                  <a
                    :href="item.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-xs text-sky-600 dark:text-sky-400 hover:underline truncate block"
                    :title="item.url"
                  >
                    {{ hostname(item.url) }}<span class="text-gray-400">{{ pathPart(item.url) }}</span>
                  </a>
                  <div class="text-xs text-gray-400 dark:text-gray-500">{{ new Date(item.scrapedAt).toLocaleDateString() }}</div>
                </div>
                <button
                  class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all shrink-0"
                  title="Unpin"
                  @click="handleRemoveUrl(item.url)"
                >
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- Fetched in conversations -->
            <div v-if="allFetchedUrls.length" class="pt-1">
              <div class="text-xs font-medium text-gray-400 dark:text-gray-500 mb-2">Used in conversations</div>
              <div class="space-y-1.5">
                <div
                  v-for="url in allFetchedUrls"
                  :key="url"
                  class="flex items-center gap-2 group py-0.5"
                >
                  <svg class="w-3 h-3 text-gray-300 dark:text-gray-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <circle cx="10" cy="10" r="4" />
                  </svg>
                  <a
                    :href="url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-xs text-gray-500 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 hover:underline truncate flex-1"
                    :title="url"
                  >
                    {{ hostname(url) }}<span class="text-gray-400 dark:text-gray-600">{{ pathPart(url) }}</span>
                  </a>
                  <!-- Quick-pin if not already pinned -->
                  <button
                    v-if="!contextUrls.some(c => c.url === url)"
                    class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-sky-500 transition-all shrink-0 text-xs"
                    title="Pin URL"
                    @click="urlInput = url; handleAddUrl()"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <div v-if="!contextUrls.length && !allFetchedUrls.length" class="text-xs text-gray-400 dark:text-gray-500">
              No URLs yet.
            </div>
          </div>

          <!-- ── Project Files section ───────────────────── -->
          <div class="px-6 py-5 space-y-3">
            <div class="flex items-center gap-2">
              <svg class="w-4 h-4 text-indigo-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              </svg>
              <h3 class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Project Files</h3>
              <span v-if="files.length" class="text-xs text-indigo-500 font-medium">{{ files.length }}</span>
            </div>
            <p class="text-xs text-gray-400 dark:text-gray-500">Injected into every LLM call for this dendro (like CLAUDE.md).</p>

            <!-- File list -->
            <div v-if="files.length === 0 && !showAddForm" class="text-xs text-gray-400 dark:text-gray-500 py-2 text-center">
              No project files yet.
            </div>

            <div
              v-for="file in files"
              :key="file.id"
              class="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-1"
            >
              <div class="flex items-center justify-between">
                <span class="text-xs font-medium text-gray-800 dark:text-gray-200 font-mono truncate">{{ file.name }}</span>
                <button
                  class="text-gray-400 hover:text-red-500 transition-colors ml-2 shrink-0"
                  title="Delete file"
                  @click="handleDeleteFile(file.id)"
                >
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
              <p class="text-xs text-gray-400 dark:text-gray-500 font-mono truncate">{{ file.content.slice(0, 80) }}{{ file.content.length > 80 ? '…' : '' }}</p>
            </div>

            <!-- Add file form -->
            <div v-if="showAddForm" class="border border-indigo-200 dark:border-indigo-700 rounded-lg p-3 space-y-2">
              <div class="flex items-center gap-2">
                <input
                  v-model="newFileName"
                  type="text"
                  placeholder="filename.md"
                  class="flex-1 text-sm px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                />
                <input
                  ref="addFileInputRef"
                  type="file"
                  accept="text/*,.ts,.tsx,.js,.jsx,.py,.json,.md,.sh,.vue"
                  class="hidden"
                  @change="handleFilePickerChange"
                />
                <button
                  class="text-xs text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 whitespace-nowrap"
                  @click="addFileInputRef?.click()"
                >
                  From file
                </button>
              </div>
              <textarea
                v-model="newFileContent"
                rows="8"
                placeholder="File content…"
                class="w-full text-xs px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono resize-none"
              />
              <p v-if="addFileError" class="text-xs text-red-500">{{ addFileError }}</p>
              <div class="flex gap-2">
                <button
                  :disabled="isSaving"
                  class="flex-1 py-1.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                  @click="handleAdd"
                >
                  {{ isSaving ? 'Saving…' : 'Save file' }}
                </button>
                <button
                  class="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg transition-colors"
                  @click="showAddForm = false"
                >
                  Cancel
                </button>
              </div>
            </div>

            <!-- Add file button -->
            <button
              v-if="!showAddForm"
              class="w-full py-2 text-xs font-medium border border-dashed border-gray-300 dark:border-gray-600 hover:border-indigo-400 dark:hover:border-indigo-500 text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition-colors flex items-center justify-center gap-1.5"
              @click="openAddForm"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              Add file
            </button>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>
