/**
 * Menu contextuel pour un nœud dans le graphe.
 */
import { useCallback } from 'react'
import { useReactFlow } from 'reactflow'
import { useGraphStore } from '../../store/graphStore'
import { getParentChoiceForTestNode } from '../../utils/testNodeSync'
import { theme } from '../../theme'

interface NodeContextMenuProps {
  id: string
  top: number
  left: number
  right?: number
  bottom?: number
  onClose: () => void
  /** Génération directe pour un choix (drop handle). */
  onGenerateForChoice?: (parentNodeId: string, choiceIndex: number) => void
  /** Génération depuis un TestNode : on envoie l’id du TestNode, le backend renvoie les connexions avec ce même id (source de vérité unique). */
  onGenerateFromTestNode?: (testNodeId: string) => void
}

export function NodeContextMenu({
  id,
  top,
  left,
  right,
  bottom,
  onClose,
  onGenerateForChoice,
  onGenerateFromTestNode,
}: NodeContextMenuProps) {
  const { duplicateNode, setShowDeleteNodeConfirm, setSelectedNode, nodes } = useGraphStore()
  const { getNode } = useReactFlow()

  const handleDuplicate = useCallback(() => {
    duplicateNode(id)
    onClose()
  }, [id, duplicateNode, onClose])

  const handleEdit = useCallback(() => {
    setSelectedNode(id)
    onClose()
  }, [id, setSelectedNode, onClose])

  const handleDelete = useCallback(() => {
    setSelectedNode(id)
    setShowDeleteNodeConfirm(true)
    onClose()
  }, [id, setSelectedNode, setShowDeleteNodeConfirm, onClose])

  const node = getNode(id)
  const isDialogueNode = node?.type === 'dialogueNode'
  const isTestNode = node?.type === 'testNode'
  const showGenerate = isDialogueNode || isTestNode

  const handleGenerate = useCallback(() => {
    if (node?.type === 'testNode') {
      if (onGenerateFromTestNode) {
        onGenerateFromTestNode(id)
      } else {
        const parentInfo = getParentChoiceForTestNode(id, nodes)
        if (parentInfo) {
          setSelectedNode(parentInfo.dialogueNodeId)
          window.dispatchEvent(new CustomEvent('open-ai-generation-panel', { detail: { nodeId: parentInfo.dialogueNodeId } }))
        }
      }
    } else {
      setSelectedNode(id)
      window.dispatchEvent(new CustomEvent('open-ai-generation-panel', { detail: { nodeId: id } }))
    }
    onClose()
  }, [id, node?.type, nodes, setSelectedNode, onClose, onGenerateForChoice, onGenerateFromTestNode])

  return (
    <div
      role="menu"
      aria-label="Actions sur le nœud"
      style={{
        position: 'fixed',
        top,
        left,
        ...(right !== undefined && { right }),
        ...(bottom !== undefined && { bottom }),
        zIndex: 10001,
        backgroundColor: theme.background.panel,
        border: `1px solid ${theme.border.primary}`,
        borderRadius: '4px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
        padding: '4px 0',
        minWidth: '160px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          padding: '8px 12px',
          fontSize: '0.75rem',
          color: theme.text.tertiary,
          borderBottom: `1px solid ${theme.border.primary}`,
          marginBottom: '4px',
          fontWeight: 'bold',
        }}
      >
        Nœud: {id.substring(0, 15)}{id.length > 15 ? '...' : ''}
      </div>

      <button
        type="button"
        role="menuitem"
        onClick={(e) => {
          e.stopPropagation()
          handleEdit()
        }}
        style={{
          width: '100%',
          padding: '8px 12px',
          textAlign: 'left',
          backgroundColor: 'transparent',
          border: 'none',
          color: theme.text.primary,
          fontSize: '0.9rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = theme.state.hover.background
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent'
        }}
      >
        <span>✏️</span>
        <span>Éditer</span>
      </button>

      {showGenerate && (
        <>
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation()
              handleGenerate()
            }}
            style={{
              width: '100%',
              padding: '8px 12px',
              textAlign: 'left',
              backgroundColor: 'transparent',
              border: 'none',
              color: theme.text.primary,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = theme.state.hover.background
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <span>✨</span>
            <span>Générer</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation()
              window.dispatchEvent(new CustomEvent('open-prompt-viewer', { detail: { nodeId: id } }))
              onClose()
            }}
            style={{
              width: '100%',
              padding: '8px 12px',
              textAlign: 'left',
              backgroundColor: 'transparent',
              border: 'none',
              color: theme.text.primary,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = theme.state.hover.background
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <span>📄</span>
            <span>Voir le prompt</span>
          </button>
        </>
      )}

      <button
        type="button"
        role="menuitem"
        onClick={(e) => {
          e.stopPropagation()
          handleDuplicate()
        }}
        disabled={!isDialogueNode}
        title={!isDialogueNode ? 'Disponible uniquement pour les nœuds de dialogue' : undefined}
        style={{
          width: '100%',
          padding: '8px 12px',
          textAlign: 'left',
          backgroundColor: 'transparent',
          border: 'none',
          color: isDialogueNode ? theme.text.primary : theme.text.tertiary,
          fontSize: '0.9rem',
          cursor: isDialogueNode ? 'pointer' : 'not-allowed',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
        onMouseEnter={(e) => {
          if (isDialogueNode) e.currentTarget.style.backgroundColor = theme.state.hover.background
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent'
        }}
      >
        <span>👯</span>
        <span>Dupliquer</span>
      </button>

      <button
        type="button"
        role="menuitem"
        onClick={(e) => {
          e.stopPropagation()
          handleDelete()
        }}
        style={{
          width: '100%',
          padding: '8px 12px',
          textAlign: 'left',
          backgroundColor: 'transparent',
          border: 'none',
          color: '#ff6b6b',
          fontSize: '0.9rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = theme.state.hover.background
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent'
        }}
      >
        <span>🗑️</span>
        <span>Supprimer</span>
      </button>
    </div>
  )
}
