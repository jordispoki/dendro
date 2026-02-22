<script setup lang="ts">
import { useTreeStore } from '~/stores/treeStore'
import { filterFreeGroups, useEnabledModelGroups } from '~/composables/useModels'

const store = useTreeStore()
const { isConvSettingsOpen, closeConvSettings } = useConvSettings()
const enabledModelGroups = useEnabledModelGroups()
const onlyFree = ref(false)
const visibleModelGroups = computed(() =>
  onlyFree.value ? filterFreeGroups(enabledModelGroups.value) : enabledModelGroups.value
)

const activeConv = computed(() =>
  store.activeConversationId ? store.conversationMap[store.activeConversationId] : null
)

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
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
