/**
 * Composant pour afficher une liste d'éléments de contexte (personnages, lieux, objets).
 * Recherche avec debounce 300ms, badge type d'entité, chargement progressif (scroll).
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { CharacterResponse, LocationResponse, ItemResponse, SpeciesResponse, CommunityResponse, ElementMode } from '../../types/api'
import { theme } from '../../theme'
import { highlightText } from '../../utils/textHighlight'
import { getGddEntitySummary } from '../../utils/gddSummary'
import { useDebounce } from '../../hooks/useDebounce'

export type ContextListItem = CharacterResponse | LocationResponse | ItemResponse | SpeciesResponse | CommunityResponse | { name: string; data?: Record<string, unknown> }

interface ContextListProps {
  items: ContextListItem[]
  selectedItems: string[]
  onItemClick: (name: string) => void
  onItemToggle: (name: string) => void
  selectedDetail: string | null
  onSelectDetail: (name: string | null) => void
  isLoading?: boolean
  getElementMode?: (name: string) => ElementMode | null
  onModeChange?: (name: string, mode: ElementMode) => void
  /** Afficher les cases à cocher (false pour listes lecture seule si besoin). */
  showCheckboxes?: boolean
  /** Label du type d'entité pour le badge (ex. "Personnage", "Lieu"). */
  entityTypeLabel?: string
  /** Callback quand l'utilisateur scroll en bas (chargement progressif). */
  onScrollToBottom?: () => void
  /** Afficher un indicateur de chargement en bas (suite de pages). */
  loadingMore?: boolean
}

type SortType = 'name-asc' | 'name-desc' | 'selected-first'

interface ContextListPropsWithTab extends ContextListProps {
  tabId?: string
}

function hasData(item: ContextListItem): item is ContextListItem & { data: Record<string, unknown> } {
  return 'data' in item && item.data != null && typeof item.data === 'object'
}

export function ContextList({
  items,
  selectedItems,
  onItemClick,
  onItemToggle,
  selectedDetail,
  onSelectDetail: _onSelectDetail, // eslint-disable-line @typescript-eslint/no-unused-vars
  isLoading = false,
  getElementMode,
  onModeChange,
  tabId,
  showCheckboxes = true,
  entityTypeLabel,
  onScrollToBottom,
  loadingMore = false,
}: ContextListPropsWithTab) {
  const [searchQueryRaw, setSearchQueryRaw] = useState('')
  const debouncedSearch = useDebounce(searchQueryRaw, 300)
  const [sortType, setSortType] = useState<SortType>('name-asc')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const storageKey = tabId ? `context-list-scroll-${tabId}` : null

  const filteredItems = useMemo(() => {
    let result = items.filter((item) =>
      item.name.toLowerCase().includes(debouncedSearch.toLowerCase())
    )
    
    // Appliquer le tri
    result = [...result].sort((a, b) => {
      const aSelected = selectedItems.includes(a.name)
      const bSelected = selectedItems.includes(b.name)
      
      switch (sortType) {
        case 'selected-first':
          if (aSelected && !bSelected) return -1
          if (!aSelected && bSelected) return 1
          // Si même statut de sélection, trier par nom
          return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
        case 'name-desc':
          return b.name.localeCompare(a.name, 'fr', { sensitivity: 'base' })
        case 'name-asc':
        default:
          return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
      }
    })
    
    return result
  }, [items, debouncedSearch, selectedItems, sortType])

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el || !onScrollToBottom) return
    const { scrollTop, scrollHeight, clientHeight } = el
    if (scrollHeight - (scrollTop + clientHeight) < 80) {
      onScrollToBottom()
    }
  }, [onScrollToBottom])

  // Raccourci clavier pour focus sur la recherche (/)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ne pas intercepter si on est déjà dans un input/textarea ou si c'est la command palette
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }
      
      if (e.key === '/') {
        e.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Restaurer la position de scroll
  useEffect(() => {
    if (storageKey && scrollContainerRef.current) {
      const savedScroll = sessionStorage.getItem(storageKey)
      if (savedScroll) {
        scrollContainerRef.current.scrollTop = parseInt(savedScroll, 10)
      }
    }
  }, [storageKey])

  // Sauvegarder la position de scroll
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container || !storageKey) return

    const handleScroll = () => {
      sessionStorage.setItem(storageKey, container.scrollTop.toString())
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [storageKey])

  if (isLoading) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center', color: theme.text.secondary }}>
        <div>Chargement...</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div
        style={{
          flexShrink: 0,
          padding: '0.65rem 0.75rem',
          borderBottom: `1px solid ${theme.border.primary}`,
          backgroundColor: theme.background.tertiary,
        }}
      >
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Rechercher... (/)"
            value={searchQueryRaw}
            onChange={(e) => setSearchQueryRaw(e.target.value)}
            style={{
              flex: 1,
              padding: '0.5rem',
              border: `1px solid ${theme.input.border}`,
              borderRadius: '4px',
              backgroundColor: theme.input.background,
              color: theme.input.color,
            }}
          />
          <select
            value={sortType}
            onChange={(e) => setSortType(e.target.value as SortType)}
            style={{
              padding: '0.5rem',
              border: `1px solid ${theme.input.border}`,
              borderRadius: '4px',
              backgroundColor: theme.input.background,
              color: theme.input.color,
              fontSize: '0.85rem',
            }}
            title="Trier les résultats"
          >
            <option value="name-asc">Nom (A-Z)</option>
            <option value="name-desc">Nom (Z-A)</option>
            <option value="selected-first">Sélectionnés en premier</option>
          </select>
        </div>
      </div>
      <div
        ref={scrollContainerRef}
        data-testid="context-list-scroll"
        onScroll={handleScroll}
        style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0.65rem', minHeight: 0 }}
      >
        {filteredItems.length === 0 ? (
          <div style={{ padding: '1rem', textAlign: 'center', color: theme.text.secondary }}>
            {debouncedSearch ? 'Aucun résultat' : 'Aucun élément'}
          </div>
        ) : (
          <>
          {filteredItems.map((item) => {
            const isSelected = selectedItems.includes(item.name)
            const isDetailSelected = selectedDetail === item.name
            const currentMode = getElementMode ? getElementMode(item.name) : null

            const handleModeClick = (e: React.MouseEvent) => {
              e.stopPropagation()
              if (onModeChange && isSelected && currentMode) {
                const newMode: ElementMode = currentMode === 'full' ? 'excerpt' : 'full'
                onModeChange(item.name, newMode)
              }
            }

            return (
              <div
                key={item.name}
                style={{
                  padding: '0.65rem 0.75rem',
                  marginBottom: '0.5rem',
                  border: isSelected
                    ? `2px solid ${currentMode === 'excerpt' ? theme.border.primary : theme.button.primary.background}`
                    : `1px solid rgba(255, 255, 255, 0.06)`,
                  borderRadius: '10px',
                  backgroundColor: isSelected
                    ? theme.state.selected.background
                    : isDetailSelected
                      ? theme.background.panel
                      : theme.background.tertiary,
                  boxShadow: isSelected ? theme.shadow.card : '0 1px 4px rgba(0, 0, 0, 0.25)',
                  color: theme.text.primary,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  transition: 'background-color 0.15s ease, box-shadow 0.15s ease',
                }}
                onClick={() => onItemClick(item.name)}
                onMouseEnter={(e) => {
                  if (!isSelected && !isDetailSelected) {
                    e.currentTarget.style.backgroundColor = theme.background.panel
                    e.currentTarget.style.boxShadow = theme.shadow.card
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected && !isDetailSelected) {
                    e.currentTarget.style.backgroundColor = theme.background.tertiary
                    e.currentTarget.style.boxShadow = '0 1px 4px rgba(0, 0, 0, 0.25)'
                  }
                }}
              >
                {showCheckboxes && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      e.stopPropagation()
                      onItemToggle(item.name)
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: isSelected ? 'bold' : 'normal' }}>
                      {highlightText(item.name, debouncedSearch)}
                    </span>
                    {entityTypeLabel && (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          padding: '0.15rem 0.4rem',
                          borderRadius: '4px',
                          backgroundColor: theme.background.tertiary,
                          color: theme.text.secondary,
                          fontWeight: 500,
                        }}
                      >
                        {entityTypeLabel}
                      </span>
                    )}
                  </span>
                  {hasData(item) && getGddEntitySummary(item.data) && (
                    <span style={{ fontSize: '0.8rem', color: theme.text.secondary, lineHeight: 1.2 }}>
                      {getGddEntitySummary(item.data)}
                    </span>
                  )}
                </div>
                {isSelected && currentMode && onModeChange && (
                  <button
                    type="button"
                    onClick={handleModeClick}
                    title={currentMode === 'full' ? 'Complet - Cliquer pour passer en Extrait' : 'Extrait - Cliquer pour passer en Complet'}
                    style={{
                      padding: '0.25rem 0.5rem',
                      border: `1px solid ${theme.border.primary}`,
                      borderRadius: '4px',
                      backgroundColor: currentMode === 'excerpt' 
                        ? theme.state.warning.background || theme.background.secondary
                        : theme.background.secondary,
                      color: currentMode === 'excerpt' 
                        ? theme.state.warning.color || theme.text.secondary
                        : theme.text.secondary,
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      minWidth: '60px',
                      justifyContent: 'center',
                    }}
                  >
                    {currentMode === 'full' ? '📄' : '✂️'}
                    <span style={{ fontSize: '0.7rem' }}>
                      {currentMode === 'full' ? 'Complet' : 'Extrait'}
                    </span>
                  </button>
                )}
              </div>
            )
          })}
          {loadingMore && (
            <div style={{ padding: '0.75rem', textAlign: 'center', color: theme.text.secondary, fontSize: '0.9rem' }}>
              Chargement…
            </div>
          )}
          </>
        )}
      </div>
    </div>
  )
}

