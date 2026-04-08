import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

export const CONTEXT_MENU_LONG_PRESS_MS = 500
export const CONTEXT_MENU_LONG_PRESS_MOVE_CANCEL_PX = 12

function readCoarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia('(pointer: coarse)').matches
}

export function useCoarsePointerMatch(): boolean {
  const [coarse, setCoarse] = useState(() => readCoarsePointer())

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(pointer: coarse)')
    const onChange = () => setCoarse(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return coarse
}

export interface GraphContextMenuLongPressHandlers {
  onPointerDownCapture: (e: ReactPointerEvent<Element>) => void
  onPointerMoveCapture: (e: ReactPointerEvent<Element>) => void
  onPointerUpCapture: (e: ReactPointerEvent<Element>) => void
  onPointerCancelCapture: (e: ReactPointerEvent<Element>) => void
  cancelForViewportInteraction: () => void
}

interface UseGraphContextMenuLongPressArgs {
  enabled: boolean
  onNodeLongPress: (nodeId: string, clientX: number, clientY: number) => void
  onPaneLongPress: (clientX: number, clientY: number) => void
}

/**
 * Long press tactile sur pane / nœud pour ouvrir les menus contextuels (équivalent clic droit, FR119).
 */
export function useGraphContextMenuLongPress({
  enabled,
  onNodeLongPress,
  onPaneLongPress,
}: UseGraphContextMenuLongPressArgs): GraphContextMenuLongPressHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startRef = useRef<{ x: number; y: number; nodeId: string | null } | null>(null)
  const optsRef = useRef({ onNodeLongPress, onPaneLongPress })
  optsRef.current = { onNodeLongPress, onPaneLongPress }

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    startRef.current = null
  }, [])

  const cancelForViewportInteraction = useCallback(() => {
    clearTimer()
  }, [clearTimer])

  const onPointerDownCapture = useCallback(
    (e: ReactPointerEvent<Element>) => {
      if (!enabled) return
      if (e.pointerType !== 'touch') return
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target.closest('button, a, input, textarea, select, [role="menu"], [role="menuitem"]')) {
        return
      }
      if (target.closest('.react-flow__handle')) return

      const nodeEl = target.closest('.react-flow__node')
      const nodeId = nodeEl?.getAttribute('data-id') ?? null
      const inPane = target.closest('.react-flow__pane')
      if (!inPane) return

      clearTimer()
      startRef.current = { x: e.clientX, y: e.clientY, nodeId }
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        const s = startRef.current
        startRef.current = null
        if (!s) return
        const { onNodeLongPress: onNode, onPaneLongPress: onPane } = optsRef.current
        if (s.nodeId) {
          onNode(s.nodeId, s.x, s.y)
        } else {
          onPane(s.x, s.y)
        }
      }, CONTEXT_MENU_LONG_PRESS_MS)
    },
    [enabled, clearTimer]
  )

  const onPointerMoveCapture = useCallback(
    (e: ReactPointerEvent<Element>) => {
      if (timerRef.current === null || startRef.current === null) return
      const s = startRef.current
      const dx = e.clientX - s.x
      const dy = e.clientY - s.y
      const thr = CONTEXT_MENU_LONG_PRESS_MOVE_CANCEL_PX
      if (dx * dx + dy * dy > thr * thr) {
        clearTimer()
      }
    },
    [clearTimer]
  )

  const onPointerUpCapture = useCallback(() => {
    clearTimer()
  }, [clearTimer])

  const onPointerCancelCapture = useCallback(() => {
    clearTimer()
  }, [clearTimer])

  return {
    onPointerDownCapture,
    onPointerMoveCapture,
    onPointerUpCapture,
    onPointerCancelCapture,
    cancelForViewportInteraction,
  }
}
