<script setup lang="ts">
import { useTreeStore, type ConversationNode } from '~/stores/treeStore'

const store = useTreeStore()
const isOpen = ref(false)
const isExpanded = ref(false)

const H_GAP = 56
const MSG_GAP = 14
const CONV_GAP = 26
const PADDING = 16
const HEAD_R = 5
const MSG_R = 3

interface MinimapNode {
  id: string
  convId: string
  title: string
  x: number
  y: number
  isHead: boolean
  messageId: string | null
  isClosed: boolean
  branchType: string | null
}

interface MinimapEdge {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  isBranch: boolean
}

const nodes = computed((): MinimapNode[] => {
  if (!store.rootConversation) return []
  const result: MinimapNode[] = []
  let y = PADDING

  function dfs(conv: ConversationNode, depth: number) {
    const msgs = store.messages[conv.id] || []
    const x = depth * H_GAP + PADDING
    const isClosed = !!conv.closedAt
    const branchType = conv.branchType ?? null
    if (msgs.length === 0) {
      result.push({ id: conv.id, convId: conv.id, title: conv.title, x, y, isHead: true, messageId: null, isClosed, branchType })
      y += CONV_GAP
    } else {
      msgs.forEach((msg, i) => {
        result.push({ id: msg.id, convId: conv.id, title: i === 0 ? conv.title : '', x, y, isHead: i === 0, messageId: msg.id, isClosed, branchType })
        y += i < msgs.length - 1 ? MSG_GAP : CONV_GAP
      })
    }
    for (const child of conv.children) {
      if (!child.deletedAt) dfs(child, depth + 1)
    }
  }

  dfs(store.rootConversation, 0)
  return result
})

const nodesByConv = computed(() => {
  const map: Record<string, MinimapNode[]> = {}
  for (const n of nodes.value) {
    if (!map[n.convId]) map[n.convId] = []
    map[n.convId].push(n)
  }
  return map
})

const nodeByMessageId = computed(() => {
  const map: Record<string, MinimapNode> = {}
  for (const n of nodes.value) {
    if (n.messageId) map[n.messageId] = n
  }
  return map
})

const edges = computed((): MinimapEdge[] => {
  const result: MinimapEdge[] = []
  for (const [convId, convNodes] of Object.entries(nodesByConv.value)) {
    for (let i = 0; i < convNodes.length - 1; i++) {
      result.push({ id: `intra-${convNodes[i].id}`, x1: convNodes[i].x, y1: convNodes[i].y, x2: convNodes[i + 1].x, y2: convNodes[i + 1].y, isBranch: false })
    }
    const conv = store.conversationMap[convId]
    if (!conv?.parentId) continue
    const firstNode = convNodes[0]
    if (!firstNode) continue
    const parentNode = (conv.branchMessageId && nodeByMessageId.value[conv.branchMessageId]) || nodesByConv.value[conv.parentId]?.at(-1)
    if (parentNode) {
      result.push({ id: `inter-${convId}`, x1: parentNode.x, y1: parentNode.y, x2: firstNode.x, y2: firstNode.y, isBranch: true })
    }
  }
  return result
})

function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2
  return `M ${x1},${y1} C ${mx},${y1} ${mx},${y2} ${x2},${y2}`
}

const svgWidth = computed(() => nodes.value.reduce((max, n) => Math.max(max, n.x + 110), 120))
const svgHeight = computed(() => nodes.value.reduce((max, n) => Math.max(max, n.y + HEAD_R + PADDING), 60))

// ── Zoom / pan for expanded view ─────────────────────────────────
const zoom = ref(1)
const panX = ref(0)
const panY = ref(0)
const isDragging = ref(false)
let dragStart = { x: 0, y: 0, px: 0, py: 0 }
const expandedSvgRef = ref<SVGSVGElement | null>(null)

const zoomPct = computed(() => Math.round(zoom.value * 100))

function resetView() {
  zoom.value = 1
  panX.value = 0
  panY.value = 0
}

// Wheel zoom — attached manually so we can set passive:false
function onWheel(e: WheelEvent) {
  e.preventDefault()
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
  const newZoom = Math.max(0.15, Math.min(12, zoom.value * factor))
  const svg = expandedSvgRef.value
  if (!svg) { zoom.value = newZoom; return }
  const rect = svg.getBoundingClientRect()
  const cx = e.clientX - rect.left
  const cy = e.clientY - rect.top
  panX.value = cx - ((cx - panX.value) / zoom.value) * newZoom
  panY.value = cy - ((cy - panY.value) / zoom.value) * newZoom
  zoom.value = newZoom
}

function onMouseDown(e: MouseEvent) {
  if (e.button !== 0) return
  isDragging.value = true
  dragStart = { x: e.clientX, y: e.clientY, px: panX.value, py: panY.value }
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

function onMouseMove(e: MouseEvent) {
  panX.value = dragStart.px + (e.clientX - dragStart.x)
  panY.value = dragStart.py + (e.clientY - dragStart.y)
}

function onMouseUp() {
  isDragging.value = false
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
}

// Attach / detach wheel listener when modal opens/closes
watch(isExpanded, async (v) => {
  if (v) {
    resetView()
    await nextTick()
    expandedSvgRef.value?.addEventListener('wheel', onWheel, { passive: false })
  } else {
    expandedSvgRef.value?.removeEventListener('wheel', onWheel)
  }
})

onUnmounted(() => {
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
})

async function navigateTo(convId: string, closeModal = false) {
  const conv = store.conversationMap[convId]
  if (!conv) return

  if (conv.closedAt) {
    // Reopen: clear closedAt in DB then in store
    try {
      await $fetch(`/api/conversations/${convId}`, {
        method: 'PATCH',
        body: { closedAt: null },
      })
      store.reopenConversation(convId)
    } catch (err) {
      console.error('Failed to reopen conversation:', err)
    }
  } else {
    store.setActiveConversation(convId)
  }

  if (closeModal) isExpanded.value = false
}
</script>

<template>
  <div class="fixed bottom-4 left-4 z-40 flex items-end gap-2">
    <!-- Corner minimap panel -->
    <div
      v-show="isOpen"
      class="absolute bottom-12 left-0 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-auto transition-all duration-200"
      :class="isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95'"
      style="max-width: 300px; max-height: 340px"
    >
      <!-- SVG (small, non-interactive) -->
      <div class="p-2">
        <svg :width="svgWidth" :height="svgHeight" class="overflow-visible">
          <template v-for="edge in edges" :key="edge.id">
            <line v-if="!edge.isBranch" :x1="edge.x1" :y1="edge.y1" :x2="edge.x2" :y2="edge.y2" stroke="#d1d5db" stroke-width="1.5" class="dark:stroke-gray-600" />
            <path v-else :d="bezierPath(edge.x1, edge.y1, edge.x2, edge.y2)" fill="none" stroke="#d1d5db" stroke-width="1.5" class="dark:stroke-gray-600" />
          </template>
          <g v-for="node in nodes" :key="node.id" class="cursor-pointer" :opacity="node.isClosed ? 0.4 : 1" @click="navigateTo(node.convId)">
            <circle v-if="node.isHead" :cx="node.x" :cy="node.y" :r="HEAD_R" :fill="node.isClosed ? 'transparent' : (store.activeConversationId === node.convId ? '#6366f1' : node.branchType === 'run' ? '#10b981' : 'white')" :stroke="node.isClosed ? '#9ca3af' : (store.activeConversationId === node.convId ? '#6366f1' : node.branchType === 'run' ? '#10b981' : '#9ca3af')" stroke-width="1.5" :stroke-dasharray="node.isClosed ? '2 2' : 'none'" class="dark:fill-gray-900" />
            <circle v-else :cx="node.x" :cy="node.y" :r="MSG_R" :fill="node.isClosed ? '#e5e7eb' : (store.activeConversationId === node.convId ? '#818cf8' : '#d1d5db')" class="dark:fill-gray-600" />
            <text v-if="node.isHead" :x="node.x + HEAD_R + 5" :y="node.y + 4" font-size="9" :fill="node.isClosed ? '#9ca3af' : '#6b7280'" class="pointer-events-none select-none">
              {{ node.title.slice(0, 20) }}{{ node.title.length > 20 ? '…' : '' }}
            </text>
          </g>
        </svg>
      </div>
    </div>

    <!-- Bottom row: expand button (when open) + toggle button -->
    <div class="flex items-center gap-2">
      <button
        v-if="isOpen"
        class="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-700 rounded-full shadow hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
        title="Expand map"
        @click="isExpanded = true"
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5h-4m4 0v-4m0 4l-5-5" />
        </svg>
        Expand
      </button>

      <button
        class="flex items-center justify-center w-10 h-10 rounded-full bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
        :title="isOpen ? 'Close minimap' : 'Open minimap'"
        @click="isOpen = !isOpen"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      </button>
    </div>
  </div>

  <!-- Expanded modal -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isExpanded"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        @click.self="isExpanded = false"
      >
        <div
          class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden"
          style="width: 80vw; height: 75vh"
        >
          <!-- Modal header -->
          <div class="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
            <span class="text-sm font-semibold text-gray-700 dark:text-gray-200">Conversation Map</span>
            <div class="flex items-center gap-3">
              <!-- Zoom controls -->
              <div class="flex items-center gap-1.5">
                <button
                  class="flex items-center justify-center w-6 h-6 rounded text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm font-medium"
                  title="Zoom out"
                  @click="zoom = Math.max(0.15, zoom / 1.25)"
                >−</button>
                <button
                  class="text-xs text-gray-400 dark:text-gray-500 w-10 text-center hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  title="Reset zoom"
                  @click="resetView"
                >{{ zoomPct }}%</button>
                <button
                  class="flex items-center justify-center w-6 h-6 rounded text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm font-medium"
                  title="Zoom in"
                  @click="zoom = Math.min(12, zoom * 1.25)"
                >+</button>
              </div>
              <div class="w-px h-4 bg-gray-200 dark:bg-gray-700" />
              <button
                class="flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="Close"
                @click="isExpanded = false"
              >
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Zoomable / pannable SVG canvas -->
          <div class="flex-1 overflow-hidden relative select-none">
            <svg
              ref="expandedSvgRef"
              class="w-full h-full"
              :class="isDragging ? 'cursor-grabbing' : 'cursor-grab'"
              @mousedown="onMouseDown"
            >
              <g :transform="`translate(${panX}, ${panY}) scale(${zoom})`">
                <template v-for="edge in edges" :key="'e-' + edge.id">
                  <line v-if="!edge.isBranch" :x1="edge.x1" :y1="edge.y1" :x2="edge.x2" :y2="edge.y2" stroke="#d1d5db" stroke-width="1.5" class="dark:stroke-gray-600" />
                  <path v-else :d="bezierPath(edge.x1, edge.y1, edge.x2, edge.y2)" fill="none" stroke="#d1d5db" stroke-width="1.5" class="dark:stroke-gray-600" />
                </template>
                <g v-for="node in nodes" :key="'n-' + node.id" class="cursor-pointer" :opacity="node.isClosed ? 0.4 : 1" @click.stop="navigateTo(node.convId, true)">
                  <circle v-if="node.isHead" :cx="node.x" :cy="node.y" :r="HEAD_R" :fill="node.isClosed ? 'transparent' : (store.activeConversationId === node.convId ? '#6366f1' : node.branchType === 'run' ? '#10b981' : 'white')" :stroke="node.isClosed ? '#9ca3af' : (store.activeConversationId === node.convId ? '#6366f1' : node.branchType === 'run' ? '#10b981' : '#9ca3af')" stroke-width="1.5" :stroke-dasharray="node.isClosed ? '2 2' : 'none'" class="dark:fill-gray-900" />
                  <circle v-else :cx="node.x" :cy="node.y" :r="MSG_R" :fill="node.isClosed ? '#e5e7eb' : (store.activeConversationId === node.convId ? '#818cf8' : '#d1d5db')" class="dark:fill-gray-600" />
                  <text v-if="node.isHead" :x="node.x + HEAD_R + 5" :y="node.y + 4" font-size="9" :fill="node.isClosed ? '#9ca3af' : '#6b7280'" class="pointer-events-none select-none">
                    {{ node.title.slice(0, 40) }}{{ node.title.length > 40 ? '…' : '' }}
                  </text>
                </g>
              </g>
            </svg>

            <!-- Hint -->
            <p class="absolute bottom-3 left-4 text-xs text-gray-400 dark:text-gray-600 pointer-events-none select-none">
              Scroll to zoom · drag to pan · click node to navigate
            </p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
