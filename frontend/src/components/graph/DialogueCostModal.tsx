/**
 * Modal de breakdown des coûts LLM pour un dialogue.
 * Extrait de GraphEditor pour isoler ce bloc JSX auto-suffisant.
 */
import { DialogueCostBreakdown } from '../usage/DialogueCostBreakdown'
import { theme } from '../../theme'

interface DialogueCostModalProps {
  filename: string
  onClose: () => void
}

export function DialogueCostModal({ filename, onClose }: DialogueCostModalProps) {
  return (
    <div
      role="dialog"
      aria-label="Breakdown des coûts du dialogue"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '440px',
          maxHeight: '85vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: theme.background.panel,
          border: `1px solid ${theme.border.primary}`,
          borderRadius: '10px',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.4)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            flex: '0 0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.75rem 1rem',
            borderBottom: `1px solid ${theme.border.primary}`,
          }}
        >
          <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: theme.text.primary }}>
            Coûts du dialogue
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.25rem 0.5rem',
              fontSize: '1.25rem',
              lineHeight: 1,
              background: 'transparent',
              color: theme.text.secondary,
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
            aria-label="Fermer"
            title="Fermer"
          >
            ×
          </button>
        </div>
        <div style={{ flex: '1 1 auto', overflowY: 'auto', padding: '1rem' }}>
          <DialogueCostBreakdown dialogueId={filename} />
        </div>
        <div
          style={{
            flex: '0 0 auto',
            display: 'flex',
            justifyContent: 'flex-end',
            padding: '0.5rem 1rem 1rem',
            borderTop: `1px solid ${theme.border.primary}`,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.4rem 0.9rem',
              fontSize: '0.875rem',
              backgroundColor: theme.button.default.background,
              color: theme.button.default.color,
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '6px',
              cursor: 'pointer',
            }}
            aria-label="Fermer le panneau des coûts"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
