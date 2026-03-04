/**
 * Menu contextuel pour un nœud dans le graphe.
 */
import { useCallback } from 'react'
import { useReactFlow } from 'reactflow'
import { useGraphStore } from '../../store/graphStore'
import { theme } from '../../theme'

interface NodeContextMenuProps {
  id: string
  top: number
  left: number
  right: number
  bottom: number
  onClose: () => void
}

export function NodeContextMenu({
  id,
  top,
  left,
  right,
  bottom,
  onClose,
}: NodeContextMenuProps) {
  const { duplicateNode, setShowDeleteNodeConfirm, setSelectedNode } = useGraphStore()
  const { getNode } = useReactFlow()

  const handleDuplicate = useCallback(() => {
    duplicateNode(id)
    onClose()
  }, [id, duplicateNode, onClose])

  const handleDelete = useCallback(() => {
    setSelectedNode(id)
    setShowDeleteNodeConfirm(true)
    onClose()
  }, [id, setSelectedNode, setShowDeleteNodeConfirm, onClose])

  const node = getNode(id)
  const isDialogueNode = node?.type === 'dialogueNode'

  return (
    <div
      role="menu"
      aria-label="Actions sur le nœud"
      style={{
        position: 'fixed',
        top,
        left,
        right,
        bottom,
        zIndex: 1000,
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
          handleDuplicate()
        }}
        disabled={!isDialogueNode}
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
