/**
 * Menu d'opérations batch sur la sélection multiple (Story 2.11 FR32).
 * Affiche "Supprimer sélection", "Tagger sélection", "Valider sélection" quand selectedNodeIds.length > 1.
 */
import { useState, useRef, useEffect } from 'react'
import { theme } from '../../theme'
import {
  GRAPH_TOOLBAR_DROPDOWN_MAX_HEIGHT,
  GRAPH_TOOLBAR_DROPDOWN_Z_INDEX,
} from './graphToolbarConstants'
import { Badge } from '../shared'

const PRESET_TAGS = ['À réviser', 'Validé', 'Brouillon', 'À relire'] as const

export interface BatchOperationsMenuProps {
  selectedNodeIds: string[]
  canEditGraph: boolean
  onBatchDeleteClick: () => void
  onBatchTagApply: (tag: string) => void
  onBatchValidateClick: () => void
}

export function BatchOperationsMenu({
  selectedNodeIds,
  canEditGraph,
  onBatchDeleteClick,
  onBatchTagApply,
  onBatchValidateClick,
}: BatchOperationsMenuProps) {
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false)
  const tagDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!tagDropdownOpen) return
    const handleDown = (e: Event) => {
      const t = e.target as Node
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(t)) {
        setTagDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleDown)
    document.addEventListener('pointerdown', handleDown)
    return () => {
      document.removeEventListener('mousedown', handleDown)
      document.removeEventListener('pointerdown', handleDown)
    }
  }, [tagDropdownOpen])

  if (selectedNodeIds.length <= 1) return null

  return (
    <>
      <Badge
        variant="neutral"
        size="md"
        title="Sélection multiple (shift-clic ou lasso)"
        style={{ backgroundColor: theme.background.tertiary, color: theme.text.primary }}
      >
        {selectedNodeIds.length} nœuds sélectionnés
      </Badge>
      <div
        style={{
          display: 'flex',
          gap: '0.35rem',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div ref={tagDropdownRef} style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => canEditGraph && setTagDropdownOpen((v) => !v)}
            disabled={!canEditGraph}
            style={{
              padding: '0.35rem 0.7rem',
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '6px',
              backgroundColor: theme.button.default.background,
              color: theme.button.default.color,
              cursor: canEditGraph ? 'pointer' : 'not-allowed',
              opacity: canEditGraph ? 1 : 0.6,
              fontSize: '0.8rem',
            }}
            title="Appliquer un tag aux nœuds sélectionnés"
          >
            Tagger sélection
          </button>
          {tagDropdownOpen && (
            <div
              role="listbox"
              aria-label="Choisir un tag"
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: '4px',
                minWidth: '140px',
                maxHeight: GRAPH_TOOLBAR_DROPDOWN_MAX_HEIGHT,
                overflowY: 'auto',
                overflowX: 'hidden',
                padding: '4px 0',
                border: `1px solid ${theme.input.border}`,
                borderRadius: '6px',
                backgroundColor: theme.input.background,
                color: theme.input.color,
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                zIndex: GRAPH_TOOLBAR_DROPDOWN_Z_INDEX,
              }}
            >
              {PRESET_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  role="option"
                  onClick={() => {
                    onBatchTagApply(tag)
                    setTagDropdownOpen(false)
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '0.4rem 0.75rem',
                    border: 'none',
                    background: 'transparent',
                    color: theme.input.color,
                    textAlign: 'left',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = theme.state.hover.background
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => void onBatchValidateClick()}
          disabled={!canEditGraph}
          style={{
            padding: '0.35rem 0.7rem',
            border: `1px solid ${theme.border.primary}`,
            borderRadius: '6px',
            backgroundColor: theme.button.default.background,
            color: theme.button.default.color,
            cursor: canEditGraph ? 'pointer' : 'not-allowed',
            opacity: canEditGraph ? 1 : 0.6,
            fontSize: '0.8rem',
          }}
          title="Valider les nœuds sélectionnés"
        >
          Valider sélection
        </button>
        <button
          type="button"
          onClick={onBatchDeleteClick}
          disabled={!canEditGraph}
          style={{
            padding: '0.35rem 0.7rem',
            border: `1px solid ${theme.state.error.border}`,
            borderRadius: '6px',
            backgroundColor: theme.state.error.background,
            color: theme.state.error.color,
            cursor: canEditGraph ? 'pointer' : 'not-allowed',
            opacity: canEditGraph ? 1 : 0.6,
            fontSize: '0.8rem',
          }}
          title="Supprimer les nœuds sélectionnés"
        >
          Supprimer sélection
        </button>
      </div>
    </>
  )
}
