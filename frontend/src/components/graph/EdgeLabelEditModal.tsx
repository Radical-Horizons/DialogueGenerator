/**
 * Modale d'édition du label d'une edge de type choix (Story 2.5 AC #4).
 * Ouverte par double-clic sur le label d'une edge choice dans le graphe.
 */
import { memo, useState, useEffect, useCallback, useRef } from 'react'
import { theme } from '../../theme'
import { useNarrowInlineSize } from '../../hooks/useNarrowInlineSize'
import { modalTypography } from '../../theme/responsiveChrome'

export interface EdgeLabelEditModalProps {
  isOpen: boolean
  initialValue: string
  onConfirm: (newText: string) => void
  onCancel: () => void
}

const FOCUSABLE_SELECTOR = 'input, button'

export const EdgeLabelEditModal = memo(function EdgeLabelEditModal({
  isOpen,
  initialValue,
  onConfirm,
  onCancel,
}: EdgeLabelEditModalProps) {
  const [value, setValue] = useState(initialValue)
  const containerRef = useRef<HTMLDivElement>(null)
  const { ref: panelRef, isNarrow } = useNarrowInlineSize(520)
  const typo = isNarrow ? modalTypography.narrow : modalTypography.comfortable

  useEffect(() => {
    if (isOpen) setValue(initialValue)
  }, [isOpen, initialValue])

  useEffect(() => {
    if (!isOpen || !containerRef.current) return
    const first = containerRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
    first?.focus()
  }, [isOpen])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Tab' || !containerRef.current) return
      const focusables = Array.from(containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      if (focusables.length === 0) return
      const i = focusables.indexOf(document.activeElement as HTMLElement)
      if (e.shiftKey) {
        if (i <= 0) {
          e.preventDefault()
          focusables[focusables.length - 1]?.focus()
        }
      } else {
        if (i === -1 || i >= focusables.length - 1) {
          e.preventDefault()
          focusables[0]?.focus()
        }
      }
    },
    []
  )

  const handleConfirm = useCallback(() => {
    onConfirm(value.trim())
  }, [value, onConfirm])

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edge-label-edit-modal-title"
      style={{
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
      }}
      onClick={onCancel}
    >
      <div
        ref={(el) => {
          (panelRef as unknown as { current: HTMLDivElement | null }).current = el
          containerRef.current = el
        }}
        role="document"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        style={{
          backgroundColor: theme.background.elevated,
          padding: isNarrow ? '0.9rem' : '1.25rem',
          borderRadius: '8px',
          minWidth: isNarrow ? 'unset' : '320px',
          border: `1px solid ${theme.border.primary}`,
        }}
      >
        <h3
          id="edge-label-edit-modal-title"
          style={{
            marginTop: 0,
            marginBottom: '0.75rem',
            color: theme.text.primary,
            fontSize: `${typo.titleFontRem}rem`,
          }}
        >
          Modifier le libellé du choix
        </h3>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConfirm()
            if (e.key === 'Escape') onCancel()
          }}
          autoFocus
          aria-label="Libellé du choix"
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            marginBottom: '1rem',
            border: `1px solid ${theme.border.primary}`,
            borderRadius: '4px',
            backgroundColor: theme.background.secondary,
            color: theme.text.primary,
            fontSize: `${typo.bodyFontRem}rem`,
            boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
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
              backgroundColor: theme.button.primary.background,
              border: 'none',
              borderRadius: '4px',
              color: theme.button.primary.color,
              cursor: 'pointer',
            }}
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
})
