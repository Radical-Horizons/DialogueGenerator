/**
 * Modale de confirmation avant suppression d'un nœud du graphe.
 * Ouverte par le raccourci Suppr. ou le bouton 🗑️ du NodeEditorPanel.
 */
import { memo } from 'react'
import { useGraphStore } from '../../store/graphStore'
import { theme } from '../../theme'
import { useNarrowInlineSize } from '../../hooks/useNarrowInlineSize'
import { modalTypography } from '../../theme/responsiveChrome'

export const DeleteNodeConfirmModal = memo(function DeleteNodeConfirmModal() {
  const {
    selectedNodeId,
    showDeleteNodeConfirm,
    setShowDeleteNodeConfirm,
    deleteNode,
  } = useGraphStore()
  const { ref: panelRef, isNarrow } = useNarrowInlineSize(520)
  const typo = isNarrow ? modalTypography.narrow : modalTypography.comfortable

  if (!showDeleteNodeConfirm || !selectedNodeId) return null

  const handleConfirm = () => {
    deleteNode(selectedNodeId)
    setShowDeleteNodeConfirm(false)
  }

  const handleCancel = () => {
    setShowDeleteNodeConfirm(false)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-node-modal-title"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
      onClick={handleCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: theme.background.elevated,
          padding: isNarrow ? '0.9rem' : '2rem',
          borderRadius: '8px',
          minWidth: isNarrow ? 'unset' : '350px',
          maxWidth: '90vw',
          border: `1px solid ${theme.border.primary}`,
        }}
        ref={panelRef}
      >
        <h3
          id="delete-node-modal-title"
          style={{ marginTop: 0, color: theme.text.primary, fontSize: `${typo.titleFontRem}rem` }}
        >
          Supprimer le nœud
        </h3>
        <p style={{ color: theme.text.secondary, fontSize: `${typo.bodyFontRem}rem` }}>
          Êtes-vous sûr de vouloir supprimer ce nœud ? Cette action est irréversible.
        </p>

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={handleCancel}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: theme.background.secondary,
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '4px',
              color: theme.text.primary,
              cursor: 'pointer',
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: theme.state.error.color,
              border: 'none',
              borderRadius: '4px',
              color: 'white',
              cursor: 'pointer',
            }}
          >
            Supprimer
          </button>
        </div>
      </div>
    </div>
  )
})
