/**
 * Barre de recherche dans le graphe (Story 2.7 - FR28).
 * Recherche par contenu texte (data.line) et/ou speaker ; met à jour les highlights
 * et permet de naviguer (Précédent/Suivant) via graphViewStore.focusNode().
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { useGraphStore } from '../../store/graphStore'
import { useGraphViewStore } from '../../store/graphViewStore'
import { theme } from '../../theme'

const SEARCH_DEBOUNCE_MS = 200

export interface GraphSearchBarProps {
  /** Appelé à la fermeture (Escape ou bouton) : le parent doit appeler setHighlightedNodes([]) et masquer la barre. */
  onClose: () => void
}

export function GraphSearchBar({ onClose }: GraphSearchBarProps) {
  const searchNodes = useGraphStore((s) => s.searchNodes)
  const setHighlightedNodes = useGraphStore((s) => s.setHighlightedNodes)
  const getUniqueSpeakers = useGraphStore((s) => s.getUniqueSpeakers)

  const [query, setQuery] = useState('')
  const [speaker, setSpeaker] = useState<string>('')
  const [resultIds, setResultIds] = useState<string[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const currentIndexRef = useRef(0)
  currentIndexRef.current = currentIndex

  const speakers = getUniqueSpeakers()

  const runSearch = useCallback(() => {
    const q = query.trim()
    const ids = searchNodes(q, speaker ? { speaker } : undefined)
    setResultIds(ids)
    setHighlightedNodes(ids)
    setCurrentIndex(ids.length > 0 ? 0 : -1)
    // AC#3 : centrer le graphe sur le premier résultat à l'affichage des résultats
    if (ids.length > 0) {
      useGraphViewStore.getState().focusNode(ids[0])
    }
  }, [query, speaker, searchNodes, setHighlightedNodes])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      runSearch()
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [runSearch])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const goToResult = useCallback(
    (index: number) => {
      if (resultIds.length === 0) return
      const i = (index + resultIds.length) % resultIds.length
      setCurrentIndex(i)
      useGraphViewStore.getState().focusNode(resultIds[i])
    },
    [resultIds]
  )

  const handlePrev = () => goToResult(currentIndex - 1)
  const handleNext = () => goToResult(currentIndex + 1)

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setHighlightedNodes([])
        onClose()
      }
      if (e.key === 'Enter' && resultIds.length > 0) {
        e.preventDefault()
        const idx = currentIndexRef.current
        const next = e.shiftKey ? (idx - 1 + resultIds.length) % resultIds.length : (idx + 1) % resultIds.length
        setCurrentIndex(next)
        useGraphViewStore.getState().focusNode(resultIds[next])
      }
    },
    [onClose, setHighlightedNodes, resultIds]
  )

  const handleClose = useCallback(() => {
    setHighlightedNodes([])
    onClose()
  }, [onClose, setHighlightedNodes])

  const count = resultIds.length
  const hasResults = count > 0

  return (
    <div
      role="search"
      style={{
        position: 'absolute',
        top: 8,
        left: 12,
        right: 12,
        zIndex: 10,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        background: theme.background.panel,
        border: `1px solid ${theme.border.primary}`,
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        maxWidth: '100%',
        boxSizing: 'border-box',
      }}
    >
      <input
        ref={inputRef}
        type="text"
        placeholder="Rechercher (texte ou speaker)..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="Recherche dans le graphe"
        style={{
          minWidth: 100,
          flex: '1 1 140px',
          maxWidth: 260,
          padding: '6px 10px',
          background: theme.input.background,
          border: `1px solid ${theme.border.primary}`,
          borderRadius: 6,
          color: theme.input.color,
          fontSize: 14,
          boxSizing: 'border-box',
        }}
      />
      {speakers.length > 0 && (
        <select
          aria-label="Filtrer par speaker"
          value={speaker}
          onChange={(e) => setSpeaker(e.target.value)}
          style={{
            padding: '6px 8px',
            background: theme.input.background,
            border: `1px solid ${theme.border.primary}`,
            borderRadius: 6,
            color: theme.input.color,
            fontSize: 14,
            minWidth: 80,
            maxWidth: 160,
            flex: '0 1 auto',
            boxSizing: 'border-box',
          }}
        >
          <option value="">Tous les speakers</option>
          {speakers.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      )}
      <span style={{ fontSize: 13, color: theme.text.secondary, whiteSpace: 'nowrap', flexShrink: 0 }}>
        {count === 0 && !query.trim() && !speaker
          ? '—'
          : `${count} résultat${count !== 1 ? 's' : ''} trouvé${count !== 1 ? 's' : ''}`}
      </span>
      <button
        type="button"
        onClick={handlePrev}
        disabled={!hasResults}
        aria-label="Résultat précédent"
        style={{
          flexShrink: 0,
          padding: '4px 8px',
          background: theme.button.default.background,
          border: `1px solid ${theme.border.primary}`,
          borderRadius: 6,
          color: theme.text.primary,
          cursor: hasResults ? 'pointer' : 'not-allowed',
          opacity: hasResults ? 1 : 0.5,
        }}
      >
        ←
      </button>
      <button
        type="button"
        onClick={handleNext}
        disabled={!hasResults}
        aria-label="Résultat suivant"
        style={{
          flexShrink: 0,
          padding: '4px 8px',
          background: theme.button.default.background,
          border: `1px solid ${theme.border.primary}`,
          borderRadius: 6,
          color: theme.text.primary,
          cursor: hasResults ? 'pointer' : 'not-allowed',
          opacity: hasResults ? 1 : 0.5,
        }}
      >
        →
      </button>
      <button
        type="button"
        onClick={handleClose}
        aria-label="Fermer la recherche"
        style={{
          flexShrink: 0,
          padding: '4px 8px',
          background: theme.button.default.background,
          border: `1px solid ${theme.border.primary}`,
          borderRadius: 6,
          color: theme.text.primary,
          cursor: 'pointer',
        }}
      >
        Fermer
      </button>
    </div>
  )
}
