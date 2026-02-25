<script setup lang="ts">
import { useSettings, type ModelEntry, type RemoteHost } from '~/composables/useSettings'
import { useEnabledModelGroups, filterFreeGroups, groupModels, type ModelOption } from '~/composables/useModels'

const { settings, isSettingsOpen, saveSettings, closeSettings } = useSettings()
const { dangerMode, toggleDangerMode } = useConvSettings()

// ── System prompt ──────────────────────────────────────────────
const systemPrompt = ref('')
watch(() => settings.value, (s) => { if (s) systemPrompt.value = s.systemPrompt }, { immediate: true })

// ── Default models ─────────────────────────────────────────────
const defaultConvModel = ref('openrouter/deepseek/deepseek-chat-v3-0324')
const defaultConvVerbosity = ref('normal')
const defaultBranchModel = ref('openrouter/deepseek/deepseek-chat-v3-0324')
const defaultBranchVerbosity = ref('normal')
const streamingEnabled = ref(true)
const localExecutionEnabled = ref(false)
const remoteHosts = ref<RemoteHost[]>([])
// Add-host form
const newHostLabel = ref('')
const newHostHost = ref('')
const newHostPort = ref(22)
const newHostUsername = ref('')
const newHostKeyPath = ref('')
const newHostSshOptions = ref('')
const newHostError = ref('')
const urlFetchSameDomain = ref(false)
const homeLayout = ref<'select' | 'classic'>('select')
const popupSearchEnabled = ref(true)
const popupSummarizeEnabled = ref(true)
const sshConfigPath = ref('')
const isPickingFile = ref(false)

watch(() => settings.value, (s) => {
  if (!s) return
  defaultConvModel.value = s.defaultConvModel
  defaultConvVerbosity.value = s.defaultConvVerbosity
  defaultBranchModel.value = s.defaultBranchModel
  defaultBranchVerbosity.value = s.defaultBranchVerbosity
  streamingEnabled.value = s.streamingEnabled !== false
  localExecutionEnabled.value = s.localExecutionEnabled === true
  remoteHosts.value = s.remoteHosts ?? []
  urlFetchSameDomain.value = s.urlFetchSameDomain === true
  homeLayout.value = (s.homeLayout as 'select' | 'classic') ?? 'select'
  sshConfigPath.value = s.sshConfigPath ?? ''
  popupSearchEnabled.value = s.popupSearchEnabled !== false
  popupSummarizeEnabled.value = s.popupSummarizeEnabled !== false
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
const googleExpanded = ref(false)
const openrouterExpanded = ref(false)

// Per-provider search filters
const googleSearch = ref('')
const openrouterSearch = ref('')
const onlyFreeOpenRouter = ref(false)

// Live model groups — reflects current enabledSet (before saving) so Default pickers stay in sync
const liveEnabledModelGroups = computed(() => {
  if (enabledSet.value.size === 0) return enabledModelGroups.value
  const allLoaded = [...googleModels.value, ...openrouterModels.value]
  const allLoadedMap = Object.fromEntries(allLoaded.map((m) => [m.value, m]))
  const savedMap = Object.fromEntries((settings.value?.enabledModels ?? []).map((m) => [m.value, m]))
  const models = [...enabledSet.value].map((v) => allLoadedMap[v] ?? savedMap[v]).filter(Boolean) as ModelOption[]
  return models.length ? groupModels(models) : enabledModelGroups.value
})

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
    googleExpanded.value = true
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
    openrouterExpanded.value = true
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

// ── Remote hosts ───────────────────────────────────────────────
const hostTestState = ref<Record<string, 'idle' | 'testing' | 'ok' | 'error'>>({})

async function saveHosts() {
  await saveSettings({ remoteHosts: remoteHosts.value, sshConfigPath: sshConfigPath.value })
}

async function pickSshConfigFile() {
  isPickingFile.value = true
  try {
    const result = await $fetch<{ path: string | null }>('/api/filepicker', {
      query: { prompt: 'Select SSH config file' },
    })
    if (result.path) {
      sshConfigPath.value = result.path
      await saveHosts()
    }
  } finally {
    isPickingFile.value = false
  }
}

async function addHost() {
  newHostError.value = ''
  if (!newHostLabel.value.trim() || !newHostHost.value.trim() || !newHostUsername.value.trim()) {
    newHostError.value = 'Label, host, and username are required'
    return
  }
  remoteHosts.value = [
    ...remoteHosts.value,
    {
      id: crypto.randomUUID(),
      label: newHostLabel.value.trim(),
      host: newHostHost.value.trim(),
      port: newHostPort.value || 22,
      username: newHostUsername.value.trim(),
      keyPath: newHostKeyPath.value.trim(),
      sshOptions: newHostSshOptions.value.trim(),
    },
  ]
  newHostLabel.value = ''
  newHostHost.value = ''
  newHostPort.value = 22
  newHostUsername.value = ''
  newHostKeyPath.value = ''
  newHostSshOptions.value = ''
  await saveHosts()
}

async function removeHost(id: string) {
  remoteHosts.value = remoteHosts.value.filter(h => h.id !== id)
  await saveHosts()
}

async function testHost(id: string) {
  hostTestState.value = { ...hostTestState.value, [id]: 'testing' }
  try {
    const result = await $fetch<{ stdout: string; stderr: string; exitCode: number }>('/api/execute', {
      method: 'POST',
      body: { command: 'echo ok', hostId: id },
    })
    hostTestState.value = { ...hostTestState.value, [id]: result.exitCode === 0 ? 'ok' : 'error' }
  } catch {
    hostTestState.value = { ...hostTestState.value, [id]: 'error' }
  }
  setTimeout(() => {
    hostTestState.value = { ...hostTestState.value, [id]: 'idle' }
  }, 4000)
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
      localExecutionEnabled: localExecutionEnabled.value,
      remoteHosts: remoteHosts.value,
      sshConfigPath: sshConfigPath.value,
      urlFetchSameDomain: urlFetchSameDomain.value,
      homeLayout: homeLayout.value,
      popupSearchEnabled: popupSearchEnabled.value,
      popupSummarizeEnabled: popupSummarizeEnabled.value,
    })
    savedMessage.value = 'Saved!'
    setTimeout(() => { savedMessage.value = '' }, 2000)
  } catch {
    savedMessage.value = 'Error saving'
  } finally {
    isSaving.value = false
  }
}

// ── Tabs ───────────────────────────────────────────────────────
const activeTab = ref<'general' | 'models' | 'hosts' | 'tools'>('general')
watch(isSettingsOpen, (open) => { if (!open) activeTab.value = 'general' })

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

        <!-- Tabs -->
        <div class="flex border-b border-gray-200 dark:border-gray-700 shrink-0">
          <!-- General -->
          <button
            class="px-5 py-3 border-b-2 transition-colors"
            :class="activeTab === 'general' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'"
            title="General"
            @click="activeTab = 'general'"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <!-- Models -->
          <button
            class="px-5 py-3 border-b-2 transition-colors"
            :class="activeTab === 'models' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'"
            title="Models"
            @click="activeTab = 'models'"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </button>
          <!-- Remote Hosts -->
          <button
            class="px-5 py-3 border-b-2 transition-colors"
            :class="activeTab === 'hosts' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'"
            title="Remote Hosts"
            @click="activeTab = 'hosts'"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
          </button>
          <!-- Tools -->
          <button
            class="px-5 py-3 border-b-2 transition-colors"
            :class="activeTab === 'tools' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'"
            title="Tools"
            @click="activeTab = 'tools'"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
            </svg>
          </button>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto px-6 py-6 space-y-8">
        <template v-if="activeTab === 'general'">

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

          <!-- Home Layout -->
          <div>
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">Home Layout</h3>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {{ homeLayout === 'select' ? 'Select: sidebar list + background.' : 'Classic: centered list.' }}
                </p>
              </div>
              <div class="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden shrink-0">
                <button
                  :class="['px-2.5 py-1 text-xs font-medium transition-colors', homeLayout === 'select' ? 'bg-indigo-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800']"
                  @click="homeLayout = 'select'"
                >Select</button>
                <button
                  :class="['px-2.5 py-1 text-xs font-medium transition-colors', homeLayout === 'classic' ? 'bg-indigo-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800']"
                  @click="homeLayout = 'classic'"
                >Classic</button>
              </div>
            </div>
          </div>

          <!-- Danger Zone -->
          <div
            :class="[
              'rounded-lg border p-4 transition-colors duration-200',
              dangerMode
                ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20'
                : 'border-gray-200 dark:border-gray-700',
            ]"
          >
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium" :class="dangerMode ? 'text-red-700 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'">
                  Danger mode
                </p>
                <p class="text-xs mt-0.5" :class="dangerMode ? 'text-red-500 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'">
                  {{ dangerMode ? 'Deleting a dendro will permanently remove it.' : 'Enables permanent (hard) delete for dendros.' }}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                :aria-checked="dangerMode"
                class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                :class="dangerMode ? 'bg-red-500' : 'bg-gray-200 dark:bg-gray-700'"
                @click="toggleDangerMode"
              >
                <span
                  class="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition duration-200"
                  :class="dangerMode ? 'translate-x-4' : 'translate-x-0'"
                />
              </button>
            </div>
          </div>

        </template>

        <!-- Models tab -->
        <template v-else-if="activeTab === 'models'">

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
                    <optgroup v-for="group in liveEnabledModelGroups" :key="group.label" :label="group.label">
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
                    <optgroup v-for="group in liveEnabledModelGroups" :key="group.label" :label="group.label">
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

          <!-- Providers -->
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Choose which models appear in the picker. If none selected, built-in defaults are shown.
          </p>

          <!-- Google Gemini -->
          <div class="mb-4 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div class="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800">
              <button
                v-if="googleModels.length"
                class="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                @click="googleExpanded = !googleExpanded"
              >
                <svg
                  class="w-3 h-3 transition-transform duration-150"
                  :class="googleExpanded ? 'rotate-90' : ''"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
                Google Gemini
              </button>
              <span v-else class="text-xs font-semibold text-gray-600 dark:text-gray-300">Google Gemini</span>
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

            <div v-if="googleModels.length && googleExpanded" class="px-3 py-2">
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
              <button
                v-if="openrouterModels.length"
                class="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                @click="openrouterExpanded = !openrouterExpanded"
              >
                <svg
                  class="w-3 h-3 transition-transform duration-150"
                  :class="openrouterExpanded ? 'rotate-90' : ''"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
                OpenRouter
              </button>
              <span v-else class="text-xs font-semibold text-gray-600 dark:text-gray-300">OpenRouter</span>
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

            <div v-if="openrouterModels.length && openrouterExpanded" class="px-3 py-2">
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
        </template>

        <!-- Remote Hosts tab -->
        <template v-else-if="activeTab === 'hosts'">
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-4">SSH hosts for running commands remotely from the terminal panel.</p>

          <!-- SSH config file -->
          <div class="mb-6">
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">SSH config file</label>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Optional. Passed as <code class="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">-F</code> to every SSH call.</p>
            <div class="flex gap-2">
              <input
                v-model="sshConfigPath"
                type="text"
                placeholder="~/.ssh/config"
                class="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                @change="saveHosts"
              />
              <button
                class="shrink-0 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors disabled:opacity-50"
                :disabled="isPickingFile"
                title="Browse for file"
                @click="pickSshConfigFile"
              >
                <svg v-if="!isPickingFile" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                </svg>
                <span v-else class="text-xs">…</span>
              </button>
            </div>
          </div>

          <!-- Existing hosts list -->
          <div v-if="remoteHosts.length" class="mb-4 space-y-1.5">
            <div
              v-for="h in remoteHosts"
              :key="h.id"
              class="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs"
            >
              <div class="flex-1 min-w-0">
                <p class="font-medium text-gray-800 dark:text-gray-200 truncate">{{ h.label }}</p>
                <p class="text-gray-500 dark:text-gray-400 font-mono truncate">{{ h.username }}@{{ h.host }}:{{ h.port }}</p>
                <p v-if="h.keyPath" class="text-gray-400 dark:text-gray-500 font-mono truncate">{{ h.keyPath }}</p>
                <p v-if="h.sshOptions" class="text-indigo-400 dark:text-indigo-500 font-mono truncate">ssh {{ h.sshOptions }}</p>
              </div>
              <!-- Test button -->
              <button
                class="shrink-0 px-2 py-1 rounded text-xs font-medium transition-colors"
                :class="{
                  'text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-700': !hostTestState[h.id] || hostTestState[h.id] === 'idle',
                  'text-gray-400 cursor-wait': hostTestState[h.id] === 'testing',
                  'text-green-600 dark:text-green-400': hostTestState[h.id] === 'ok',
                  'text-red-500 dark:text-red-400': hostTestState[h.id] === 'error',
                }"
                :disabled="hostTestState[h.id] === 'testing'"
                title="Test connection"
                @click="testHost(h.id)"
              >
                <span v-if="!hostTestState[h.id] || hostTestState[h.id] === 'idle'">Test</span>
                <span v-else-if="hostTestState[h.id] === 'testing'">…</span>
                <span v-else-if="hostTestState[h.id] === 'ok'">✓ OK</span>
                <span v-else>✗ Fail</span>
              </button>
              <button
                class="shrink-0 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                title="Remove host"
                @click="removeHost(h.id)"
              >
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <p v-else class="text-xs text-gray-400 dark:text-gray-500 mb-4">No hosts configured yet.</p>

          <!-- Add host form -->
          <div class="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 p-3 space-y-2">
            <p class="text-xs font-medium text-gray-500 dark:text-gray-400">Add host</p>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Label</label>
                <input
                  v-model="newHostLabel"
                  type="text"
                  placeholder="My Server"
                  class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">URL / Host</label>
                <input
                  v-model="newHostHost"
                  type="text"
                  placeholder="192.168.1.1"
                  class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                />
              </div>
              <div>
                <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">User</label>
                <input
                  v-model="newHostUsername"
                  type="text"
                  placeholder="ubuntu"
                  class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                />
              </div>
              <div>
                <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Port</label>
                <input
                  v-model.number="newHostPort"
                  type="number"
                  min="1"
                  max="65535"
                  placeholder="22"
                  class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                />
              </div>
            </div>
            <div>
              <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Path to key (optional)</label>
              <input
                v-model="newHostKeyPath"
                type="text"
                placeholder="~/.ssh/id_rsa"
                class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
              />
            </div>
            <div>
              <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">SSH options (optional)</label>
              <input
                v-model="newHostSshOptions"
                type="text"
                placeholder="-o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new"
                class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
              />
              <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">Replaces the default SSH flags. Leave blank to use defaults (<code class="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">-o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new -o BatchMode=yes</code>).</p>
            </div>
            <p v-if="newHostError" class="text-xs text-red-500">{{ newHostError }}</p>
            <button
              class="w-full text-xs py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium transition-colors"
              @click="addHost"
            >
              + Add
            </button>
          </div>
        </template>

        <!-- Tools tab -->
        <template v-else-if="activeTab === 'tools'">

          <!-- Local Execution -->
          <div>
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">Local Execution</h3>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Run shell commands from the chat and send output to the LLM.</p>
              </div>
              <button
                type="button"
                role="switch"
                :aria-checked="localExecutionEnabled"
                class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                :class="localExecutionEnabled ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'"
                @click="localExecutionEnabled = !localExecutionEnabled"
              >
                <span
                  class="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition duration-200"
                  :class="localExecutionEnabled ? 'translate-x-4' : 'translate-x-0'"
                />
              </button>
            </div>
          </div>

          <!-- Same-Domain Scraping -->
          <div>
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">Same-Domain Scraping</h3>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">When fetching a URL, also follow up to 5 internal links on the same domain.</p>
              </div>
              <button
                type="button"
                role="switch"
                :aria-checked="urlFetchSameDomain"
                class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                :class="urlFetchSameDomain ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'"
                @click="urlFetchSameDomain = !urlFetchSameDomain"
              >
                <span
                  class="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition duration-200"
                  :class="urlFetchSameDomain ? 'translate-x-4' : 'translate-x-0'"
                />
              </button>
            </div>
          </div>

          <!-- Selection popup -->
          <div>
            <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Selection Popup</h3>
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-xs font-medium text-gray-600 dark:text-gray-400">Search</p>
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Show "Search Google" button when text is selected.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  :aria-checked="popupSearchEnabled"
                  class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  :class="popupSearchEnabled ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'"
                  @click="popupSearchEnabled = !popupSearchEnabled"
                >
                  <span
                    class="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition duration-200"
                    :class="popupSearchEnabled ? 'translate-x-4' : 'translate-x-0'"
                  />
                </button>
              </div>
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-xs font-medium text-gray-600 dark:text-gray-400">Summarize</p>
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Show "Summarize & copy" button when text is selected.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  :aria-checked="popupSummarizeEnabled"
                  class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  :class="popupSummarizeEnabled ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'"
                  @click="popupSummarizeEnabled = !popupSummarizeEnabled"
                >
                  <span
                    class="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition duration-200"
                    :class="popupSummarizeEnabled ? 'translate-x-4' : 'translate-x-0'"
                  />
                </button>
              </div>
            </div>
          </div>

        </template>

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
