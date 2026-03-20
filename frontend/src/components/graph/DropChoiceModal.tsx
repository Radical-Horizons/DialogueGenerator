/**
 * Modal affichée quand on lâche un lien de choix dans le vide (sans le relier à un nœud).
 * Propose de créer un nœud vide ou de générer un nœud (IA) relié au parent.
 */
import { memo } from 'react'
import { theme } from '../../theme'
import { GenerationLoaderContent } from './GenerationLoaderContent'

export interface DropChoiceModalProps {
  isOpen: boolean
  onClose: () => void
  onCreateEmpty: () => void
  onGenerate: () => void
  isGenerating?: boolean
}

export const DropChoiceModal = memo(function DropChoiceModal({
  isOpen,
  onClose,
  onCreateEmpty,
  onGenerate,
  isGenerating = false,
}: DropChoiceModalProps) {
  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10001,
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="drop-choice-modal-title"
    >
      <div
        style={{
          backgroundColor: theme.background.panel,
          borderRadius: 8,
          padding: '1.25rem 1.5rem',
          maxWidth: 360,
          width: '90%',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          border: `1px solid ${theme.border.primary}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          id="drop-choice-modal-title"
          style={{
            margin: '0 0 1rem',
            fontSize: '1rem',
            color: theme.text.primary,
          }}
        >
          Lien relâché dans le vide
        </h3>
        <p
          style={{
            margin: '0 0 1.25rem',
            fontSize: '0.875rem',
            color: theme.text.secondary,
          }}
        >
          Créer un nœud à cet emplacement et le relier au choix ?
        </p>
        {isGenerating ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem',
              padding: '0.75rem 0',
            }}
            role="status"
            aria-live="polite"
          >
            <GenerationLoaderContent />
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.35rem 0.75rem',
                border: `1px solid ${theme.border.primary}`,
                borderRadius: 6,
                backgroundColor: 'transparent',
                color: theme.text.secondary,
                cursor: 'pointer',
                fontSize: '0.8rem',
                marginTop: '0.25rem',
              }}
            >
              Annuler
            </button>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <button
              type="button"
              onClick={() => {
                onCreateEmpty()
                onClose()
              }}
              style={{
                padding: '0.5rem 1rem',
                border: `1px solid ${theme.border.primary}`,
                borderRadius: 6,
                backgroundColor: theme.button.default.background,
                color: theme.button.default.color,
                cursor: 'pointer',
                fontSize: '0.875rem',
                textAlign: 'left',
              }}
            >
              ➕ Créer un nœud vide
            </button>
            <button
              type="button"
              onClick={() => onGenerate()}
              style={{
                padding: '0.5rem 1rem',
                border: `1px solid ${theme.button.primary.background}`,
                borderRadius: 6,
                backgroundColor: theme.button.primary.background,
                color: theme.button.primary.color,
                cursor: 'pointer',
                fontSize: '0.875rem',
                textAlign: 'left',
              }}
            >
              ✨ Générer un nœud (IA)
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.5rem 1rem',
                border: `1px solid ${theme.border.primary}`,
                borderRadius: 6,
                backgroundColor: 'transparent',
                color: theme.text.secondary,
                cursor: 'pointer',
                fontSize: '0.875rem',
                marginTop: '0.25rem',
              }}
            >
              Annuler
            </button>
          </div>
        )}
      </div>
    </div>
  )
})
