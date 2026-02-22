import { useTreeStore } from '~/stores/treeStore'

export function useLLM() {
  const store = useTreeStore()

  async function sendMessage(conversationId: string, content: string) {
    // Optimistically add user message
    store.addMessage(conversationId, {
      id: `user-${Date.now()}`,
      conversationId,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    })

    // Start streaming
    store.startStreaming(conversationId)

    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.chunk) {
                store.appendStreamChunk(data.chunk)
              } else if (data.done) {
                store.finishStreaming()
                // Reload messages from server to get persisted IDs
                await loadMessages(conversationId)
                return
              } else if (data.error) {
                console.error('LLM error:', data.error)
                store.finishStreaming()
                await loadMessages(conversationId)
                return
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      }

      store.finishStreaming()
      await loadMessages(conversationId)
    } catch (err) {
      console.error('Send message error:', err)
      store.finishStreaming()
      await loadMessages(conversationId)
    }
  }

  async function loadMessages(conversationId: string) {
    try {
      const messages = await $fetch(`/api/conversations/${conversationId}/messages`)
      store.setMessages(conversationId, messages as any[])
    } catch (err) {
      console.error('Load messages error:', err)
    }
  }

  return { sendMessage, loadMessages }
}
