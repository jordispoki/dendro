const isConvSettingsOpen = ref(false)

export function useConvSettings() {
  function openConvSettings() {
    isConvSettingsOpen.value = true
  }
  function closeConvSettings() {
    isConvSettingsOpen.value = false
  }
  return {
    isConvSettingsOpen: readonly(isConvSettingsOpen),
    openConvSettings,
    closeConvSettings,
  }
}
