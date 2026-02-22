const isConvSettingsOpen = ref(false)
const dangerMode = ref(false)

export function useConvSettings() {
  function openConvSettings() {
    isConvSettingsOpen.value = true
  }
  function closeConvSettings() {
    isConvSettingsOpen.value = false
  }
  function toggleDangerMode() {
    dangerMode.value = !dangerMode.value
  }
  return {
    isConvSettingsOpen: readonly(isConvSettingsOpen),
    dangerMode: readonly(dangerMode),
    openConvSettings,
    closeConvSettings,
    toggleDangerMode,
  }
}
