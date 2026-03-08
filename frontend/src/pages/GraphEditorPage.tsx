/**
 * Page standalone de l'éditeur de graphe.
 * Réutilise le composant principal pour éviter la divergence avec le dashboard.
 */
import { memo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { GraphEditor } from '../components/graph/GraphEditor'
import { theme } from '../theme'

export const GraphEditorPage = memo(function GraphEditorPage() {
  const navigate = useNavigate()
  const { dialogueId } = useParams<{ dialogueId?: string }>()

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
        onDialogueSelected={(filename) => {
          navigate(
            `/graph-editor/${encodeURIComponent(filename.replace(/\.json$/i, ''))}`,
            { replace: true }
          )
        }}
      />
    </div>
  )
})
