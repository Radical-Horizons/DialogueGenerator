/**
 * Menu contextuel pour le fond (pane) du graphe — clic droit sur zone vide.
 * Story 2.12 (FR33), AC #3, #4, #5.
 */
import { useCallback } from 'react'
import { theme } from '../../theme'

interface PaneContextMenuProps {
  top: number
  left: number
  onCreateNode: () => void
  onAutoLayout: () => void
  onClose: () => void
}

const menuItemStyle: React.CSSProperties = {
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
}

export function PaneContextMenu({
  top,
  left,
  onCreateNode,
  onAutoLayout,
  onClose,
}: PaneContextMenuProps) {
  const handleCreateNode = useCallback(() => {
    onCreateNode()
    onClose()
  }, [onCreateNode, onClose])

  const handleAutoLayout = useCallback(() => {
    onAutoLayout()
    onClose()
  }, [onAutoLayout, onClose])

  return (
    <div
      role="menu"
      aria-label="Actions sur le graphe"
      style={{
        position: 'fixed',
        top,
        left,
        zIndex: 10001,
        backgroundColor: theme.background.panel,
        border: `1px solid ${theme.border.primary}`,
        borderRadius: '4px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
        padding: '4px 0',
        minWidth: '160px',
      }}
    >
      <button
        type="button"
        role="menuitem"
        onClick={(e) => {
          e.stopPropagation()
          handleCreateNode()
        }}
        style={menuItemStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = theme.state.hover.background
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent'
        }}
      >
        <span>➕</span>
        <span>Nouveau nœud</span>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={(e) => {
          e.stopPropagation()
          handleAutoLayout()
        }}
        style={menuItemStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = theme.state.hover.background
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent'
        }}
      >
        <span>🔀</span>
        <span>Auto-layout</span>
      </button>
    </div>
  )
}
