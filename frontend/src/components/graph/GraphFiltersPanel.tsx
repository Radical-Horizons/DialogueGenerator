/**
 * Story 2.9 FR30: panneau filtres graphe — types de nœuds (dialogue/test/end), speakers.
 * Temps réel, pas de bouton Valider. Accessible (focus trap, Escape).
 */
import { useCallback, useEffect, useRef } from 'react'
import { useGraphStore } from '../../store/graphStore'
import type { NodeType } from '../../store/types/graphState'
import { applyNodeFilters } from './graphFilterUtils'
import { theme } from '../../theme'

const NODE_TYPE_LABELS: Record<NodeType, string> = {
  dialogue: 'Dialogue',
  test: 'Test',
  end: 'Fin',
}

export interface GraphFiltersPanelProps {
  isOpen: boolean
  onClose: () => void
}

export function GraphFiltersPanel({ isOpen, onClose }: GraphFiltersPanelProps) {
  const nodes = useGraphStore((s) => s.nodes)
  const graphFilters = useGraphStore((s) => s.graphFilters)
  const setFilters = useGraphStore((s) => s.setFilters)
  const resetFilters = useGraphStore((s) => s.resetFilters)
  const getUniqueSpeakers = useGraphStore((s) => s.getUniqueSpeakers)

  const panelRef = useRef<HTMLDivElement>(null)
  const speakers = getUniqueSpeakers()
  const visibleCount = applyNodeFilters(nodes, graphFilters).length
  const hiddenCount = nodes.length - visibleCount

  const toggleType = useCallback(
    (type: NodeType) => {
      const hidden = graphFilters.hiddenTypes ?? []
      const next = hidden.includes(type)
        ? hidden.filter((t) => t !== type)
        : [...hidden, type]
      setFilters({ ...graphFilters, hiddenTypes: next.length ? next : undefined })
    },
    [graphFilters, setFilters]
  )

  const toggleSpeaker = useCallback(
    (speaker: string) => {
      const allowed = graphFilters.allowedSpeakers ?? []
      const next = allowed.includes(speaker)
        ? allowed.filter((s) => s !== speaker)
        : [...allowed, speaker]
      setFilters({ ...graphFilters, allowedSpeakers: next.length ? next : undefined })
    },
    [graphFilters, setFilters]
  )

  useEffect(() => {
    if (!isOpen) return
    const firstFocusable = panelRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    firstFocusable?.focus()
  }, [isOpen])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const el = panelRef.current
      if (!el) return
      const focusables = Array.from(
        el.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      )
      const idx = focusables.indexOf(document.activeElement as HTMLElement)
      if (idx === -1) return
      const next = e.shiftKey ? idx - 1 : idx + 1
      if (next < 0) {
        e.preventDefault()
        focusables[focusables.length - 1]?.focus()
      } else if (next >= focusables.length) {
        e.preventDefault()
        focusables[0]?.focus()
      }
    },
    [onClose]
  )

  if (!isOpen) return null

  const typeChecked = (t: NodeType) => !(graphFilters.hiddenTypes ?? []).includes(t)
  const speakerChecked = (s: string) => (graphFilters.allowedSpeakers ?? []).includes(s)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Filtres du graphe"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '15vh',
        zIndex: 10001,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        onKeyDown={handleKeyDown}
        style={{
          backgroundColor: theme.background.panel,
          borderRadius: '8px',
          padding: '1rem 1.25rem',
          minWidth: '280px',
          maxWidth: '90vw',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          border: `1px solid ${theme.border.primary}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', color: theme.text.primary }}>
          Filtres du graphe
        </h3>

        <fieldset style={{ border: 'none', padding: 0, marginBottom: '1rem' }}>
          <legend style={{ marginBottom: 6, color: theme.text.secondary, fontSize: '0.9rem' }}>
            Types de nœuds
          </legend>
          {(['dialogue', 'test', 'end'] as const).map((type) => (
            <label
              key={type}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 6,
                cursor: 'pointer',
                color: theme.text.primary,
              }}
            >
              <input
                type="checkbox"
                checked={typeChecked(type)}
                onChange={() => toggleType(type)}
                aria-label={`Afficher nœuds ${NODE_TYPE_LABELS[type]}`}
              />
              <span>Afficher nœuds {NODE_TYPE_LABELS[type]}</span>
            </label>
          ))}
        </fieldset>

        {speakers.length > 0 && (
          <fieldset style={{ border: 'none', padding: 0, marginBottom: '1rem' }}>
            <legend style={{ marginBottom: 6, color: theme.text.secondary, fontSize: '0.9rem' }}>
              Speakers (afficher uniquement)
            </legend>
            {speakers.map((speaker) => (
              <label
                key={speaker}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 6,
                  cursor: 'pointer',
                  color: theme.text.primary,
                }}
              >
                <input
                  type="checkbox"
                  checked={speakerChecked(speaker)}
                  onChange={() => toggleSpeaker(speaker)}
                  aria-label={`Afficher uniquement speaker ${speaker}`}
                />
                <span>{speaker}</span>
              </label>
            ))}
          </fieldset>
        )}

        {hiddenCount > 0 && (
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: theme.text.secondary }}>
            {hiddenCount} nœud{hiddenCount > 1 ? 's' : ''} masqué{hiddenCount > 1 ? 's' : ''}
          </p>
        )}

        <button
          type="button"
          onClick={() => resetFilters()}
          style={{
            padding: '8px 12px',
            fontSize: '0.9rem',
            border: `1px solid ${theme.border.primary}`,
            borderRadius: 6,
            backgroundColor: theme.button.default.background,
            color: theme.button.default.color,
            cursor: 'pointer',
          }}
          aria-label="Réinitialiser filtres"
        >
          Réinitialiser filtres
        </button>
      </div>
    </div>
  )
}
