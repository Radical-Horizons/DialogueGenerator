/**
 * Prototype 20.2 : le palier de zoom se pose à la fin d'un geste (`onMoveEnd`), jamais à
 * chaque image. `gestureRef` reste vrai tant que l'utilisateur déplace ou zoome la vue.
 */
import { useMemo, useRef } from 'react'
import type { Viewport } from 'reactflow'
import { useGraphViewStore } from '../store/graphViewStore'
import { zoomTierForZoom } from '../utils/zoomTiers'

export interface ZoomTierMoveHandlers {
  gestureRef: React.MutableRefObject<boolean>
  onGestureMove: (event: unknown) => void
  onGestureEnd: (event: unknown, viewport: Viewport) => void
}

export function useZoomTierMoveHandlers(): ZoomTierMoveHandlers {
  const gestureRef = useRef(false)
  return useMemo(
    () => ({
      gestureRef,
      onGestureMove: (event: unknown) => {
        if (event) gestureRef.current = true
      },
      onGestureEnd: (_event: unknown, viewport: Viewport) => {
        gestureRef.current = false
        useGraphViewStore.getState().setZoomTier(zoomTierForZoom(viewport.zoom))
      },
    }),
    []
  )
}
