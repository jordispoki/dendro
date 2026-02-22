<script setup lang="ts">
import { useTreeStore } from '~/stores/treeStore'
import { filterFreeGroups, useEnabledModelGroups } from '~/composables/useModels'
import { useLLM } from '~/composables/useLLM'

const store = useTreeStore()
const { sendMessage } = useLLM()
const { settings: globalSettings } = useSettings()

const editableModel = ref('')
const editableVerbosity = ref('normal')
const firstMessage = ref('')
const firstMessageRef = ref<HTMLTextAreaElement | null>(null)
const onlyFree = ref(false)
const showSettings = ref(false)
const enabledModelGroups = useEnabledModelGroups()
const visibleModelGroups = computed(() => onlyFree.value ? filterFreeGroups(enabledModelGroups.value) : enabledModelGroups.value)

watch(
  () => store.branchPreview,
  (preview) => {
    if (preview) {
      editableModel.value = globalSettings.value?.defaultBranchModel || preview.model
      editableVerbosity.value = globalSettings.value?.defaultBranchVerbosity || 'normal'
      firstMessage.value = preview.selectedText
      showSettings.value = false
      nextTick(() => firstMessageRef.value?.focus())
    }
  },
  { immediate: true }
)

async function openBranch() {
  const preview = store.branchPreview
  if (!preview || !store.currentTreeId) return

  try {
    const conversation = await $fetch('/api/conversations', {
      method: 'POST',
      body: {
        treeId: store.currentTreeId,
        parentId: preview.parentConversationId,
        title: preview.suggestedTitle,
        model: editableModel.value,
        verbosity: editableVerbosity.value,
        branchText: preview.selectedText,
        branchMessageId: preview.parentMessageId,
        branchSummary: preview.summary,
      },
    })

    const convId = (conversation as any).id
    store.addConversation(conversation as any)
    store.setActiveConversation(convId)
    store.closeBranchPreview()

    if (firstMessage.value.trim()) {
      await sendMessage(convId, firstMessage.value.trim())
    }
  } catch (err) {
    console.error('Failed to create branch:', err)
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="store.branchPreview?.open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      @click.self="store.closeBranchPreview()"
    >
      <div class="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6">
        <!-- Header -->
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Create Branch</h2>
          <div class="flex items-center gap-2">
            <!-- Conversation settings toggle -->
            <button
              :class="[
                'flex items-center justify-center w-8 h-8 rounded-lg border transition-colors',
                showSettings
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20'
                  : 'border-gray-200 dark:border-gray-700 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400',
              ]"
              title="Conversation settings"
              @click="showSettings = !showSettings"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
            </button>
            <button
              class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              @click="store.closeBranchPreview()"
            >
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Inline conversation settings -->
        <div
          v-if="showSettings"
          class="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3"
        >
          <div class="flex items-center gap-3">
            <div class="flex-1">
              <div class="flex items-center justify-between mb-1">
                <label class="text-xs font-medium text-gray-500 dark:text-gray-400">Model</label>
                <label class="flex items-center gap-1 text-xs text-gray-400 cursor-pointer select-none">
                  <input v-model="onlyFree" type="checkbox" class="w-3 h-3 accent-indigo-600" />
                  Free only
                </label>
              </div>
              <select
                v-model="editableModel"
                class="w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <optgroup v-for="group in visibleModelGroups" :key="group.label" :label="group.label">
                  <option v-for="m in group.models" :key="m.value" :value="m.value">{{ m.label }}</option>
                </optgroup>
              </select>
            </div>
            <div class="w-32">
              <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Response length</label>
              <select
                v-model="editableVerbosity"
                class="w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="concise">Concise</option>
                <option value="normal">Normal</option>
                <option value="detailed">Detailed</option>
              </select>
            </div>
          </div>
        </div>

        <!-- First message -->
        <div class="mb-6">
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Message
            <span v-if="store.branchPreview?.isSummarizing" class="ml-2 inline-flex items-center gap-1 font-normal opacity-60">
              <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              building context…
            </span>
          </label>
          <textarea
            ref="firstMessageRef"
            v-model="firstMessage"
            rows="4"
            class="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            @keydown.enter.ctrl="openBranch"
            @keydown.enter.meta="openBranch"
          />
        </div>

        <div class="flex justify-end gap-3">
          <button
            class="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
            @click="store.closeBranchPreview()"
          >
            Cancel
          </button>
          <button
            :disabled="store.branchPreview?.isSummarizing"
            class="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            @click="openBranch"
          >
            Open Branch
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
