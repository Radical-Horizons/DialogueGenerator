/**
 * Page standalone de l'éditeur de graphe.
 * Réutilise le composant principal pour éviter la divergence avec le dashboard.
 */
import { memo, useCallback, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { GraphEditor } from '../components/graph/GraphEditor'
import { useGraphViewStore } from '../store/graphViewStore'
import { theme } from '../theme'

export const GraphEditorPage = memo(function GraphEditorPage() {
  const navigate = useNavigate()
  const { dialogueId } = useParams<{ dialogueId?: string }>()

  const showDialogueInUrl = useCallback(
    (filename: string) => {
      navigate(`/graph-editor/${encodeURIComponent(filename.replace(/\.json$/i, ''))}`, {
        replace: true,
      })
    },
    [navigate]
  )

  const routeDialogueRevert = useGraphViewStore((s) => s.routeDialogueRevert)
  useEffect(() => {
    if (!routeDialogueRevert) return
    useGraphViewStore.getState().clearRouteDialogueRevert()
    showDialogueInUrl(routeDialogueRevert)
  }, [routeDialogueRevert, showDialogueInUrl])

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        backgroundColor: theme.background.primary,
      }}
    >
      <GraphEditor
        mode="standalone"
        routeDialogueId={dialogueId}
        onBack={() => navigate('/')}
        onDialogueSelected={showDialogueInUrl}
      />
    </div>
  )
})
