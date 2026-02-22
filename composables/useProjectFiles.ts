export interface ProjectFile {
  id: string
  treeId: string
  name: string
  content: string
  createdAt: string
}

export interface TreeContextUrl {
  url: string
  content: string
  scrapedAt: string
}

const files = ref<ProjectFile[]>([])
const contextUrls = ref<TreeContextUrl[]>([])
const isFilesOpen = ref(false)

export function useProjectFiles() {
  async function fetchFiles(treeId: string) {
    try {
      const [fileData, treeData] = await Promise.all([
        $fetch<ProjectFile[]>(`/api/trees/${treeId}/files`),
        $fetch<{ contextUrls: string }>(`/api/trees/${treeId}`),
      ])
      files.value = fileData
      contextUrls.value = typeof treeData.contextUrls === 'string'
        ? JSON.parse(treeData.contextUrls || '[]')
        : (treeData.contextUrls ?? [])
    } catch (err) {
      console.error('Failed to fetch project files:', err)
    }
  }

  async function addFile(treeId: string, name: string, content: string) {
    const file = await $fetch<ProjectFile>(`/api/trees/${treeId}/files`, {
      method: 'POST',
      body: { name, content },
    })
    files.value.push(file)
    return file
  }

  async function deleteFile(treeId: string, fileId: string) {
    await $fetch(`/api/trees/${treeId}/files/${fileId}`, { method: 'DELETE' })
    files.value = files.value.filter((f) => f.id !== fileId)
  }

  async function addContextUrl(treeId: string, url: string): Promise<{ scrapedAt: string; contentLength: number }> {
    const result = await $fetch<{ url: string; scrapedAt: string; contentLength: number }>(
      `/api/trees/${treeId}/context-urls`,
      { method: 'POST', body: { url } }
    )
    const existing = contextUrls.value.filter((u) => u.url !== url)
    contextUrls.value = [...existing, { url, content: '', scrapedAt: result.scrapedAt }]
    return result
  }

  async function removeContextUrl(treeId: string, url: string) {
    await $fetch(`/api/trees/${treeId}/context-urls`, { method: 'DELETE', body: { url } })
    contextUrls.value = contextUrls.value.filter((u) => u.url !== url)
  }

  function openFiles() {
    isFilesOpen.value = true
  }

  function closeFiles() {
    isFilesOpen.value = false
  }

  return {
    files: readonly(files),
    contextUrls: readonly(contextUrls),
    isFilesOpen: readonly(isFilesOpen),
    fetchFiles,
    addFile,
    deleteFile,
    addContextUrl,
    removeContextUrl,
    openFiles,
    closeFiles,
  }
}
