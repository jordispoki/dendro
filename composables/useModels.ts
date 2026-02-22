export interface ModelOption {
  value: string
  label: string
  free?: boolean
}

export interface ModelGroup {
  label: string
  models: ModelOption[]
}

export const MODEL_GROUPS: ModelGroup[] = [
  {
    label: 'Google Gemini',
    models: [
      { value: 'google/gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' },
      { value: 'google/gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    ],
  },
  {
    label: 'OpenRouter',
    models: [
      { value: 'openrouter/openai/gpt-4o-mini', label: 'GPT-4o Mini' },
      { value: 'openrouter/openai/gpt-4o', label: 'GPT-4o' },
      { value: 'openrouter/anthropic/claude-3-haiku', label: 'Claude 3 Haiku' },
      { value: 'openrouter/anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
      { value: 'openrouter/anthropic/claude-3.7-sonnet', label: 'Claude 3.7 Sonnet' },
      { value: 'openrouter/deepseek/deepseek-chat-v3-0324', label: 'DeepSeek V3' },
      { value: 'openrouter/deepseek/deepseek-r1-0528:free', label: 'DeepSeek R1 (free)', free: true },
      { value: 'openrouter/meta-llama/llama-3.1-8b-instruct:free', label: 'Llama 3.1 8B (free)', free: true },
      { value: 'openrouter/mistralai/mistral-7b-instruct:free', label: 'Mistral 7B (free)', free: true },
    ],
  },
]

export const ALL_MODELS: ModelOption[] = MODEL_GROUPS.flatMap((g) => g.models)

export function modelLabel(value: string): string {
  return ALL_MODELS.find((m) => m.value === value)?.label ?? value
}

export function filterFreeGroups(groups: ModelGroup[]): ModelGroup[] {
  return groups
    .map((g) => ({ ...g, models: g.models.filter((m) => m.free) }))
    .filter((g) => g.models.length > 0)
}

function groupModels(models: ModelOption[]): ModelGroup[] {
  const google = models.filter((m) => m.value.startsWith('google/'))
  const openrouter = models.filter((m) => m.value.startsWith('openrouter/'))
  const groups: ModelGroup[] = []
  if (google.length) groups.push({ label: 'Google Gemini', models: google })
  if (openrouter.length) groups.push({ label: 'OpenRouter', models: openrouter })
  return groups.length ? groups : MODEL_GROUPS
}

export function useEnabledModelGroups() {
  const { settings } = useSettings()
  return computed(() => {
    const enabled = settings.value?.enabledModels ?? []
    return enabled.length ? groupModels(enabled) : MODEL_GROUPS
  })
}
