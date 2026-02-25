export interface ModelEntry {
  value: string
  label: string
  free?: boolean
}

export interface RemoteHost {
  id: string
  label: string
  host: string
  port: number
  username: string
  keyPath: string
  sshOptions: string
}

export interface Settings {
  id: string
  userId: string
  systemPrompt: string
  enabledModels: ModelEntry[]
  defaultConvModel: string
  defaultConvVerbosity: string
  defaultBranchModel: string
  defaultBranchVerbosity: string
  streamingEnabled: boolean
  localExecutionEnabled: boolean
  remoteHosts: RemoteHost[]
  urlFetchSameDomain: boolean
  homeLayout: 'select' | 'classic'
  sshConfigPath: string
  popupSearchEnabled: boolean
  popupSummarizeEnabled: boolean
}

const FALLBACK_MODEL = 'openrouter/deepseek/deepseek-chat-v3-0324'

const settings = ref<Settings | null>(null)
const isLoaded = ref(false)
const isSettingsOpen = ref(false)

export function useSettings() {
  async function fetchSettings() {
    if (isLoaded.value) return
    try {
      settings.value = await $fetch<Settings>('/api/settings')
      isLoaded.value = true
    } catch (err) {
      console.error('Failed to fetch settings:', err)
    }
  }

  async function saveSettings(patch: Partial<Omit<Settings, 'id' | 'userId'>>) {
    try {
      settings.value = await $fetch<Settings>('/api/settings', {
        method: 'PATCH',
        body: patch,
      })
    } catch (err) {
      console.error('Failed to save settings:', err)
      throw err
    }
  }

  function openSettings() {
    isSettingsOpen.value = true
    fetchSettings()
  }

  function closeSettings() {
    isSettingsOpen.value = false
  }

  return {
    settings: readonly(settings),
    isSettingsOpen: readonly(isSettingsOpen),
    isLoaded: readonly(isLoaded),
    FALLBACK_MODEL,
    fetchSettings,
    saveSettings,
    openSettings,
    closeSettings,
  }
}
