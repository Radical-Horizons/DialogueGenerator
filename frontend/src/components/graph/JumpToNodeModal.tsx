/**
 * Story 2.8 FR29: Modal "Jump to Node" — saisie ID ou nom, autocomplete, centrage sur le nœud.
 * Raccourci Ctrl+J (géré dans GraphEditor). Réutilise jumpToNode (setSelectedNode + graphViewStore.focusNode).
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { useGraphStore } from '../../store/graphStore'
import { theme } from '../../theme'
import { useNarrowInlineSize } from '../../hooks/useNarrowInlineSize'
import { modalTypography } from '../../theme/responsiveChrome'

const DEBOUNCE_MS = 200

export interface JumpToNodeModalProps {
  isOpen: boolean
  onClose: () => void
}

export function JumpToNodeModal({ isOpen, onClose }: JumpToNodeModalProps) {
  const findNodesByQuery = useGraphStore((s) => s.findNodesByQuery)
  const jumpToNode = useGraphStore((s) => s.jumpToNode)
  const { ref: panelRef, isNarrow } = useNarrowInlineSize(520)
  const typo = isNarrow ? modalTypography.narrow : modalTypography.comfortable

  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Array<{ id: string; label: string }>>([])
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [notFoundMessage, setNotFoundMessage] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const updateSuggestions = useCallback(() => {
    const next = findNodesByQuery(query)
    setSuggestions(next)
    setHighlightedIndex(0)
    setNotFoundMessage(null)
  }, [query, findNodesByQuery])

  useEffect(() => {
    if (!isOpen) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      updateSuggestions()
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [isOpen, query, updateSuggestions])

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSuggestions([])
      setNotFoundMessage(null)
      setHighlightedIndex(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isOpen])

  // Scroll l'option mise en surbrillance dans le champ de vue (listRef). Garde pour JSDOM (tests) où scrollIntoView peut être absent.
  useEffect(() => {
    if (suggestions.length === 0) return
    const nodeId = suggestions[highlightedIndex]?.id ?? suggestions[0]?.id
    const el = listRef.current?.querySelector<HTMLElement>(`#jump-option-${nodeId}`)
    if (typeof el?.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [suggestions, highlightedIndex])

  const handleSelect = useCallback(
    (nodeId: string) => {
      jumpToNode(nodeId)
      onClose()
    },
    [jumpToNode, onClose]
  )

  const handleSubmit = useCallback(() => {
    // Annule le debounce en cours : s'il se déclenchait après Enter, il effacerait notFoundMessage.
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    if (suggestions.length > 0) {
      const node = suggestions[highlightedIndex] ?? suggestions[0]
      handleSelect(node.id)
      return
    }
    const live = (inputRef.current?.value ?? query).trim()
    if (live !== '') {
      setNotFoundMessage('Nœud non trouvé')
    }
  }, [suggestions, highlightedIndex, query, handleSelect])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        handleSubmit()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const next = (highlightedIndex + 1) % Math.max(1, suggestions.length)
        setHighlightedIndex(next)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightedIndex((i) =>
          i <= 0 ? Math.max(0, suggestions.length - 1) : i - 1
        )
        return
      }
      // Focus trap (Task 3.3 / NFR-A1): Tab / Shift+Tab reste dans le modal (input ↔ liste).
      if (e.key === 'Tab') {
        const target = e.target as HTMLElement
        if (target === inputRef.current) {
          if (!e.shiftKey && suggestions.length > 0) {
            e.preventDefault()
            const nodeId = suggestions[highlightedIndex]?.id ?? suggestions[0].id
            listRef.current?.querySelector<HTMLElement>(`#jump-option-${nodeId}`)?.focus()
          }
          return
        }
        if (target.closest('#jump-to-node-list')) {
          e.preventDefault()
          inputRef.current?.focus()
        }
      }
    },
    [onClose, handleSubmit, suggestions, highlightedIndex]
  )

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Jump to node"
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
        style={{
          backgroundColor: theme.background.panel,
          borderRadius: '8px',
          padding: isNarrow ? '0.85rem' : '1rem 1.25rem',
          minWidth: isNarrow ? 'unset' : '320px',
          maxWidth: '90vw',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          border: `1px solid ${theme.border.primary}`,
        }}
        onClick={(e) => e.stopPropagation()}
        ref={panelRef}
      >
        <label
          htmlFor="jump-to-node-input"
          style={{
            display: 'block',
            marginBottom: 8,
            color: theme.text.secondary,
            fontSize: `${typo.subtitleFontRem}rem`,
          }}
        >
          ID ou nom du nœud
        </label>
        <input
          id="jump-to-node-input"
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Jump to node"
          aria-autocomplete="list"
          aria-expanded={suggestions.length > 0}
          aria-controls="jump-to-node-list"
          aria-activedescendant={suggestions[highlightedIndex] ? `jump-option-${suggestions[highlightedIndex].id}` : undefined}
          placeholder="Saisir un ID ou un nom..."
          style={{
            width: '100%',
            padding: '8px 12px',
            fontSize: `${typo.bodyFontRem}rem`,
            border: `1px solid ${theme.border.primary}`,
            borderRadius: 6,
            backgroundColor: theme.background.primary,
            color: theme.text.primary,
            boxSizing: 'border-box',
          }}
        />
        {notFoundMessage && (
          <p role="alert" style={{ marginTop: 8, color: theme.state.error.color, fontSize: `${typo.bodyFontRem}rem` }}>
            {notFoundMessage}
          </p>
        )}
        {suggestions.length > 0 && (
          <ul
            id="jump-to-node-list"
            ref={listRef}
            role="listbox"
            style={{
              marginTop: 8,
              maxHeight: 240,
              overflowY: 'auto',
              listStyle: 'none',
              padding: 0,
              margin: 0,
              border: `1px solid ${theme.border.primary}`,
              borderRadius: 6,
            }}
          >
            {suggestions.map((item, index) => (
              <li
                key={item.id}
                id={`jump-option-${item.id}`}
                role="option"
                aria-selected={index === highlightedIndex}
                tabIndex={index === highlightedIndex ? 0 : -1}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  backgroundColor: index === highlightedIndex ? theme.state.hover?.background ?? theme.background.tertiary : 'transparent',
                  color: theme.text.primary,
                  borderBottom: index < suggestions.length - 1 ? `1px solid ${theme.border.secondary}` : undefined,
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => handleSelect(item.id)}
              >
                <span style={{ fontWeight: 500, color: theme.text.secondary }}>{item.id}</span>
                {item.label && item.label !== item.id && (
                  <span style={{ marginLeft: 8 }}> — {item.label}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
