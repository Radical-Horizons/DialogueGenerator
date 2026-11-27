/**
 * Comportements du canvas propres au prototype de cartes de texte (Story 20.2) : palier de
 * zoom posé à la fin des mouvements et sortie de l'écriture.
 */
import { useEffect } from 'react'
import { useStore } from 'reactflow'
import { useGraphStore } from '../../store/graphStore'
import { useGraphViewStore } from '../../store/graphViewStore'
import { useUiLayoutStore } from '../../store/uiLayoutStore'
import { zoomTierForZoom } from '../../utils/zoomTiers'

/** Délai de stabilité d'un zoom programmé, que React Flow ne signale pas par `onMoveEnd`. */
const PROGRAMMATIC_ZOOM_SETTLE_MS = 120

export function TextCardCanvasEffects({
  gestureRef,
}: {
  gestureRef: React.MutableRefObject<boolean>
}) {
  const zoom = useStore((s) => s.transform[2])

  // Pendant un geste, rien : c'est `onMoveEnd` qui pose le palier. Les zooms programmés
  // (ajuster, boutons, recentrage) n'émettent pas `onMoveEnd` : ils sont repris ici.
  useEffect(() => {
    if (gestureRef.current) return
    const timer = window.setTimeout(() => {
      if (!gestureRef.current) {
        useGraphViewStore.getState().setZoomTier(zoomTierForZoom(zoom))
      }
    }, PROGRAMMATIC_ZOOM_SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [zoom, gestureRef])

  const writingNodeId = useGraphViewStore((s) => s.writingNodeId)
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId)
  const documentId = useGraphStore((s) => s.documentId)
  const inspectorTab = useUiLayoutStore((s) => s.inspectorTab)

  // Rouvrir l'inspecteur ou changer de nœud rend la main : un seul écrivain à la fois.
  useEffect(() => {
    const { writingNodeId: current, setWritingNode } = useGraphViewStore.getState()
    if (current != null && (selectedNodeId !== current || inspectorTab !== null)) {
      setWritingNode(null)
    }
  }, [writingNodeId, selectedNodeId, inspectorTab])

  useEffect(() => () => useGraphViewStore.getState().setWritingNode(null), [documentId])

  return null
}
