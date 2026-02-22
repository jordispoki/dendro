<script setup lang="ts">
import { useSettings, type ModelEntry } from '~/composables/useSettings'
import { useEnabledModelGroups, filterFreeGroups } from '~/composables/useModels'

const { settings, isSettingsOpen, saveSettings, closeSettings } = useSettings()

// ── System prompt ──────────────────────────────────────────────
const systemPrompt = ref('')
watch(() => settings.value, (s) => { if (s) systemPrompt.value = s.systemPrompt }, { immediate: true })

// ── Default models ─────────────────────────────────────────────
const defaultConvModel = ref('openrouter/deepseek/deepseek-chat-v3-0324')
const defaultConvVerbosity = ref('normal')
const defaultBranchModel = ref('openrouter/deepseek/deepseek-chat-v3-0324')
const defaultBranchVerbosity = ref('normal')
const streamingEnabled = ref(true)

watch(() => settings.value, (s) => {
  if (!s) return
  defaultConvModel.value = s.defaultConvModel
  defaultConvVerbosity.value = s.defaultConvVerbosity
  defaultBranchModel.value = s.defaultBranchModel
  defaultBranchVerbosity.value = s.defaultBranchVerbosity
  streamingEnabled.value = s.streamingEnabled !== false
}, { immediate: true })

const enabledModelGroups = useEnabledModelGroups()

// ── Model selection ────────────────────────────────────────────
const enabledSet = ref<Set<string>>(new Set())

watch(() => settings.value?.enabledModels, (models) => {
  if (models) enabledSet.value = new Set(models.map((m) => m.value))
}, { immediate: true })

// All models fetched from APIs
const googleModels = ref<ModelEntry[]>([])
const openrouterModels = ref<ModelEntry[]>([])
const isLoadingGoogle = ref(false)
const isLoadingOpenRouter = ref(false)
const googleError = ref('')
const openrouterError = ref('')

// Per-provider search filters
const googleSearch = ref('')
const openrouterSearch = ref('')
const onlyFreeOpenRouter = ref(false)

const filteredGoogle = computed(() => {
  const q = googleSearch.value.toLowerCase()
  return q ? googleModels.value.filter((m) => m.label.toLowerCase().includes(q)) : googleModels.value
})

const filteredOpenRouter = computed(() => {
  let list = openrouterModels.value
  if (onlyFreeOpenRouter.value) list = list.filter((m) => m.free)
  const q = openrouterSearch.value.toLowerCase()
  return q ? list.filter((m) => m.label.toLowerCase().includes(q)) : list
})

async function loadGoogleModels() {
  isLoadingGoogle.value = true
  googleError.value = ''
  try {
    const data = await $fetch<{ models: ModelEntry[] }>('/api/providers/google/models')
    googleModels.value = data.models
  } catch (err: any) {
    googleError.value = err?.data?.message ?? 'Failed to load'
  } finally {
    isLoadingGoogle.value = false
  }
}

async function loadOpenRouterModels() {
  isLoadingOpenRouter.value = true
  openrouterError.value = ''
  try {
    const data = await $fetch<{ models: ModelEntry[] }>('/api/providers/openrouter/models')
    openrouterModels.value = data.models
  } catch (err: any) {
    openrouterError.value = err?.data?.message ?? 'Failed to load'
  } finally {
    isLoadingOpenRouter.value = false
  }
}

function toggleModel(model: ModelEntry) {
  const next = new Set(enabledSet.value)
  if (next.has(model.value)) next.delete(model.value)
  else next.add(model.value)
  enabledSet.value = next
}

function toggleAll(models: ModelEntry[], checked: boolean) {
  const next = new Set(enabledSet.value)
  for (const m of models) checked ? next.add(m.value) : next.delete(m.value)
  enabledSet.value = next
}

function allChecked(models: ModelEntry[]) {
  return models.length > 0 && models.every((m) => enabledSet.value.has(m.value))
}

// Build the full ModelEntry list for enabled set (preserves saved entries not yet in loaded lists)
function computeEnabledModels(): ModelEntry[] {
  const allLoaded = [...googleModels.value, ...openrouterModels.value]
  const allLoadedMap = Object.fromEntries(allLoaded.map((m) => [m.value, m]))
  const savedMap = Object.fromEntries((settings.value?.enabledModels ?? []).map((m) => [m.value, m]))
  return [...enabledSet.value].map((v) => allLoadedMap[v] ?? savedMap[v]).filter(Boolean) as ModelEntry[]
}

// ── Save ───────────────────────────────────────────────────────
const isSaving = ref(false)
const savedMessage = ref('')

async function handleSave() {
  isSaving.value = true
  try {
    await saveSettings({
      systemPrompt: systemPrompt.value,
      enabledModels: computeEnabledModels(),
      defaultConvModel: defaultConvModel.value,
      defaultConvVerbosity: defaultConvVerbosity.value,
      defaultBranchModel: defaultBranchModel.value,
      defaultBranchVerbosity: defaultBranchVerbosity.value,
      streamingEnabled: streamingEnabled.value,
    })
    savedMessage.value = 'Saved!'
    setTimeout(() => { savedMessage.value = '' }, 2000)
  } catch {
    savedMessage.value = 'Error saving'
  } finally {
    isSaving.value = false
  }
}

// Count helpers for collapsed state
const googleEnabledCount = computed(() =>
  (settings.value?.enabledModels ?? []).filter((m) => m.value.startsWith('google/')).length
)
const openrouterEnabledCount = computed(() =>
  (settings.value?.enabledModels ?? []).filter((m) => m.value.startsWith('openrouter/')).length
)
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
      <div v-if="isSettingsOpen" class="fixed inset-0 z-40 bg-black/40" @click="closeSettings()" />
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
        v-if="isSettingsOpen"
        class="fixed top-0 right-0 z-50 h-full w-full max-w-sm bg-white dark:bg-gray-900 shadow-2xl flex flex-col"
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Settings</h2>
          <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" @click="closeSettings()">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto px-6 py-6 space-y-8">

          <!-- System Prompt -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">System Prompt</label>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">Prepended to every conversation.</p>
            <textarea
              v-model="systemPrompt"
              rows="6"
              placeholder="You are a helpful assistant..."
              class="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          <!-- Defaults -->
          <div>
            <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Defaults</h3>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-4">Pre-selected model and verbosity when starting a new conversation or branch.</p>

            <!-- New conversation defaults -->
            <div class="mb-3">
              <p class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">New conversation</p>
              <div class="flex gap-2">
                <div class="flex-1">
                  <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Model</label>
                  <select
                    v-model="defaultConvModel"
                    class="w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <optgroup v-for="group in enabledModelGroups" :key="group.label" :label="group.label">
                      <option v-for="m in group.models" :key="m.value" :value="m.value">{{ m.label }}</option>
                    </optgroup>
                  </select>
                </div>
                <div class="w-28">
                  <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Verbosity</label>
                  <select
                    v-model="defaultConvVerbosity"
                    class="w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="concise">Concise</option>
                    <option value="normal">Normal</option>
                    <option value="detailed">Detailed</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- Branch defaults -->
            <div>
              <p class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Branch</p>
              <div class="flex gap-2">
                <div class="flex-1">
                  <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Model</label>
                  <select
                    v-model="defaultBranchModel"
                    class="w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <optgroup v-for="group in enabledModelGroups" :key="group.label" :label="group.label">
                      <option v-for="m in group.models" :key="m.value" :value="m.value">{{ m.label }}</option>
                    </optgroup>
                  </select>
                </div>
                <div class="w-28">
                  <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Verbosity</label>
                  <select
                    v-model="defaultBranchVerbosity"
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

          <!-- Streaming -->
          <div>
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">Streaming</h3>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Show responses token by token as they arrive.</p>
              </div>
              <button
                type="button"
                role="switch"
                :aria-checked="streamingEnabled"
                class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                :class="streamingEnabled ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'"
                @click="streamingEnabled = !streamingEnabled"
              >
                <span
                  class="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition duration-200"
                  :class="streamingEnabled ? 'translate-x-4' : 'translate-x-0'"
                />
              </button>
            </div>
          </div>

          <!-- Providers & Models -->
          <div>
            <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Providers &amp; Models</h3>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Choose which models appear in the picker. If none selected, built-in defaults are shown.
            </p>

            <!-- Google Gemini -->
            <div class="mb-4 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <div class="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800">
                <span class="text-xs font-semibold text-gray-600 dark:text-gray-300">Google Gemini</span>
                <div class="flex items-center gap-2">
                  <span v-if="googleEnabledCount" class="text-xs text-indigo-500">{{ googleEnabledCount }} selected</span>
                  <button
                    class="text-xs text-indigo-500 hover:text-indigo-700 disabled:opacity-50"
                    :disabled="isLoadingGoogle"
                    @click="loadGoogleModels"
                  >
                    {{ isLoadingGoogle ? 'Loading…' : googleModels.length ? 'Refresh' : 'Load models' }}
                  </button>
                </div>
              </div>

              <div v-if="googleModels.length" class="px-3 py-2">
                <div class="flex items-center gap-2 mb-2">
                  <input
                    v-model="googleSearch"
                    type="text"
                    placeholder="Filter…"
                    class="flex-1 text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <label class="flex items-center gap-1 text-xs text-gray-500 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      class="w-3 h-3 accent-indigo-600"
                      :checked="allChecked(filteredGoogle)"
                      @change="toggleAll(filteredGoogle, !allChecked(filteredGoogle))"
                    />
                    All
                  </label>
                </div>
                <div class="space-y-1 max-h-44 overflow-y-auto">
                  <label
                    v-for="m in filteredGoogle"
                    :key="m.value"
                    class="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 py-0.5"
                  >
                    <input type="checkbox" class="w-3 h-3 accent-indigo-600" :checked="enabledSet.has(m.value)" @change="toggleModel(m)" />
                    {{ m.label }}
                  </label>
                </div>
              </div>
              <p v-if="googleError" class="px-3 py-2 text-xs text-red-500">{{ googleError }}</p>
            </div>

            <!-- OpenRouter -->
            <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <div class="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800">
                <span class="text-xs font-semibold text-gray-600 dark:text-gray-300">OpenRouter</span>
                <div class="flex items-center gap-2">
                  <span v-if="openrouterEnabledCount" class="text-xs text-indigo-500">{{ openrouterEnabledCount }} selected</span>
                  <button
                    class="text-xs text-indigo-500 hover:text-indigo-700 disabled:opacity-50"
                    :disabled="isLoadingOpenRouter"
                    @click="loadOpenRouterModels"
                  >
                    {{ isLoadingOpenRouter ? 'Loading…' : openrouterModels.length ? 'Refresh' : 'Load models' }}
                  </button>
                </div>
              </div>

              <div v-if="openrouterModels.length" class="px-3 py-2">
                <div class="flex items-center gap-2 mb-2">
                  <input
                    v-model="openrouterSearch"
                    type="text"
                    placeholder="Filter…"
                    class="flex-1 text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <label class="flex items-center gap-1 text-xs text-gray-500 cursor-pointer select-none">
                    <input v-model="onlyFreeOpenRouter" type="checkbox" class="w-3 h-3 accent-indigo-600" />
                    Free
                  </label>
                  <label class="flex items-center gap-1 text-xs text-gray-500 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      class="w-3 h-3 accent-indigo-600"
                      :checked="allChecked(filteredOpenRouter)"
                      @change="toggleAll(filteredOpenRouter, !allChecked(filteredOpenRouter))"
                    />
                    All
                  </label>
                </div>
                <div class="space-y-1 max-h-56 overflow-y-auto">
                  <label
                    v-for="m in filteredOpenRouter"
                    :key="m.value"
                    class="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 py-0.5"
                  >
                    <input type="checkbox" class="w-3 h-3 accent-indigo-600" :checked="enabledSet.has(m.value)" @change="toggleModel(m)" />
                    <span class="flex-1 truncate">{{ m.label }}</span>
                    <span v-if="m.free" class="shrink-0 text-green-600 dark:text-green-400 font-medium">free</span>
                  </label>
                </div>
              </div>
              <p v-if="openrouterError" class="px-3 py-2 text-xs text-red-500">{{ openrouterError }}</p>
            </div>
          </div>

        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <span v-if="savedMessage" class="text-sm" :class="savedMessage.startsWith('Error') ? 'text-red-500' : 'text-green-600 dark:text-green-400'">
            {{ savedMessage }}
          </span>
          <span v-else />
          <button
            :disabled="isSaving"
            class="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-colors"
            @click="handleSave"
          >
            {{ isSaving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
