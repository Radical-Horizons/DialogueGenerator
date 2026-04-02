/**
 * Modale de régénération d'un nœud rejeté avec instructions ajustées (Story 1.10 - AC#1, AC#3).
 * Instructions pré-remplies, historique avec "Utiliser", boutons Régénérer / Annuler.
 */
import { memo, useState, useEffect } from 'react'
import { theme } from '../../theme'
import type { RegenerationEntry } from '../../types/graph'

export interface RegenerateNodeModalProps {
  isOpen: boolean
  nodeId: string
  /** Dernières instructions utilisées (pré-remplissage). */
  initialInstructions: string
  /** Historique des régénérations (max 10). */
  history: RegenerationEntry[]
  /** Afficher le message AC#5 si le contexte GDD a changé depuis la génération. */
  contextGddChanged?: boolean
  onRegenerate: (nodeId: string, newInstructions: string) => Promise<void>
  onClose: () => void
}

const modalStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 2000,
}

const panelStyle: React.CSSProperties = {
  backgroundColor: theme.background.panel,
  padding: '1.5rem',
  borderRadius: '8px',
  minWidth: '420px',
  maxWidth: '90vw',
  maxHeight: '85vh',
  overflow: 'auto',
  border: `1px solid ${theme.border.primary}`,
}

export const RegenerateNodeModal = memo(function RegenerateNodeModal({
  isOpen,
  nodeId,
  initialInstructions,
  history,
  contextGddChanged = false,
  onRegenerate,
  onClose,
}: RegenerateNodeModalProps) {
  const [instructions, setInstructions] = useState(initialInstructions)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [historyExpanded, setHistoryExpanded] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setInstructions(initialInstructions)
      setIsSubmitting(false)
      setHistoryExpanded(false)
    }
  }, [isOpen, initialInstructions])

  if (!isOpen) return null

  const handleUseHistory = (entry: RegenerationEntry) => {
    setInstructions(entry.instructions)
    setHistoryExpanded(false)
  }

  const handleRegenerate = async () => {
    const trimmed = instructions.trim()
    if (!trimmed) return
    setIsSubmitting(true)
    try {
      await onRegenerate(nodeId, trimmed)
      onClose()
    } catch (err) {
      console.error('Régénération échouée:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="regenerate-node-modal-title"
      style={modalStyle}
      onClick={handleBackdropClick}
    >
      <div onClick={(e) => e.stopPropagation()} style={panelStyle}>
        <h3
          id="regenerate-node-modal-title"
          style={{ marginTop: 0, marginBottom: '1rem', color: theme.text.primary }}
        >
          Régénérer le nœud
        </h3>

        {contextGddChanged && (
          <p
            role="status"
            style={{
              marginTop: 0,
              marginBottom: '1rem',
              padding: '0.5rem 0.75rem',
              backgroundColor: theme.state.warning?.background ?? 'rgba(245, 166, 35, 0.15)',
              border: `1px solid ${theme.state.warning?.color ?? '#F5A623'}`,
              borderRadius: '4px',
              color: theme.text.primary,
              fontSize: '0.85rem',
            }}
          >
            Contexte GDD mis à jour depuis la génération originale.
          </p>
        )}
        <label
          htmlFor="regenerate-instructions"
          style={{
            display: 'block',
            marginBottom: '0.35rem',
            color: theme.text.secondary,
            fontSize: '0.9rem',
          }}
        >
          Instructions
        </label>
        <textarea
          aria-describedby="regenerate-instructions-hint"
          id="regenerate-instructions"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Ex: Tone plus sombre, moins de répétition"
          rows={4}
          disabled={isSubmitting}
          style={{
            width: '100%',
            padding: '0.5rem',
            borderRadius: '4px',
            border: `1px solid ${theme.border.primary}`,
            backgroundColor: theme.background.secondary,
            color: theme.text.primary,
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
        <span
          id="regenerate-instructions-hint"
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: 'hidden',
            clip: 'rect(0,0,0,0)',
            border: 0,
          }}
        >
          Modifier les instructions avant de régénérer le nœud.
        </span>

        {history.length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <button
              type="button"
              onClick={() => setHistoryExpanded((v) => !v)}
              style={{
                padding: '0.35rem 0.5rem',
                backgroundColor: 'transparent',
                border: `1px solid ${theme.border.primary}`,
                borderRadius: '4px',
                color: theme.text.secondary,
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              {historyExpanded ? 'Masquer' : 'Historique'} ({history.length})
            </button>
            {historyExpanded && (
              <ul
                style={{
                  marginTop: '0.5rem',
                  paddingLeft: '1.25rem',
                  maxHeight: '160px',
                  overflowY: 'auto',
                  color: theme.text.secondary,
                  fontSize: '0.85rem',
                }}
              >
                {[...history].reverse().map((entry) => (
                  <li
                    key={entry.generationId}
                    style={{
                      marginBottom: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span
                      style={{
                        flex: '1 1 auto',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={entry.instructions}
                    >
                      {entry.instructions.slice(0, 60)}
                      {entry.instructions.length > 60 ? '…' : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleUseHistory(entry)}
                      disabled={isSubmitting}
                      style={{
                        padding: '0.2rem 0.5rem',
                        backgroundColor: theme.button.default.background,
                        border: `1px solid ${theme.border.primary}`,
                        borderRadius: '4px',
                        color: theme.text.primary,
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                      }}
                    >
                      Utiliser
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            justifyContent: 'flex-end',
            marginTop: '1.25rem',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
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
            onClick={handleRegenerate}
            disabled={isSubmitting || !instructions.trim()}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: theme.button.primary.background,
              border: 'none',
              borderRadius: '4px',
              color: theme.button.primary.color,
              cursor: isSubmitting ? 'wait' : 'pointer',
            }}
          >
            {isSubmitting ? 'Régénération…' : 'Régénérer'}
          </button>
        </div>
      </div>
    </div>
  )
})
