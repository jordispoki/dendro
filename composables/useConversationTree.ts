import { useTreeStore, type ConversationNode } from '~/stores/treeStore'

export type ColumnRole = 'ancestor' | 'active' | 'sibling'

export interface Column {
  conversation: ConversationNode
  role: ColumnRole
}

export function useConversationTree() {
  const store = useTreeStore()

  const visibleColumns = computed((): Column[] => {
    if (!store.rootConversation || !store.activeConversationId) return []

    const activeId = store.activeConversationId
    const convMap = store.conversationMap

    const columns: Column[] = []

    const activeConv = convMap[activeId]

    // Only the immediate parent as 'ancestor' (one column to the left)
    if (activeConv?.parentId) {
      const parent = convMap[activeConv.parentId]
      if (parent) columns.push({ conversation: parent, role: 'ancestor' })
    }

    // Active conversation
    if (activeConv) columns.push({ conversation: activeConv, role: 'active' })

    // Only the first non-deleted, non-closed child as 'sibling' (one column to the right)
    if (activeConv) {
      const firstChild = activeConv.children.find((c) => !c.deletedAt && !c.closedAt)
      if (firstChild) columns.push({ conversation: firstChild, role: 'sibling' })
    }

    return columns
  })

  return { visibleColumns }
}
