/**
 * Liste d'éléments de contexte GDD : filtre, tri, badge type, scroll infini.
 * La barre de recherche peut être intégrée ou fournie par le parent (recherche inter-onglets).
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { RefObject } from 'react'
import type {
  CharacterResponse,
  LocationResponse,
  ItemResponse,
  SpeciesResponse,
  CommunityResponse,
  ElementMode,
} from '../../types/api'
import { theme } from '../../theme'
import { remSize } from '../../theme/uiTypography'
import { listItemSelectionStyle, listRowHairlineBorder, listRowHoverBackground } from '../../theme/selectionTokens'
import { redesignAccent, redesignFont, redesignText } from '../../theme/redesignTokens'
import { highlightText } from '../../utils/textHighlight'
import { getGddEntitySummary } from '../../utils/gddSummary'
import { useDebounce } from '../../hooks/useDebounce'
import {
  ContextSearchControls,
  type ContextSortType,
} from './ContextSearchControls'

export type ContextEntityTab =
  | 'characters'
  | 'locations'
  | 'items'
  | 'species'
  | 'communities'

export type ContextListItem = (
  | CharacterResponse
  | LocationResponse
  | ItemResponse
  | SpeciesResponse
  | CommunityResponse
  | { name: string; data?: Record<string, unknown> }
) & {
  /** Onglet d'origine (recherche inter-onglets). */
  entityTab?: ContextEntityTab
  /** Badge type d'entité (prioritaire sur `entityTypeLabel` global). */
  entityTypeLabel?: string
}

interface ContextListProps {
  items: ContextListItem[]
  selectedItems: string[]
  onItemClick: (name: string, entityTab?: ContextEntityTab) => void
  onItemToggle: (name: string, entityTab?: ContextEntityTab) => void
  selectedDetail: string | null
  onSelectDetail: (name: string | null) => void
  isLoading?: boolean
  getElementMode?: (name: string, entityTab?: ContextEntityTab) => ElementMode | null
  onModeChange?: (name: string, mode: ElementMode, entityTab?: ContextEntityTab) => void
  /** Sélection typée (évite collisions de noms inter-onglets). */
  isItemSelected?: (name: string, entityTab?: ContextEntityTab) => boolean
  /** Afficher les cases à cocher (false pour listes lecture seule si besoin). */
  showCheckboxes?: boolean
  /** Label du type d'entité pour le badge (ex. "Personnage", "Lieu"). */
  entityTypeLabel?: string
  /** Callback quand l'utilisateur scroll en bas (chargement progressif). */
  onScrollToBottom?: () => void
  /** Afficher un indicateur de chargement en bas (suite de pages). */
  loadingMore?: boolean
  /**
   * Indique qu'il reste des pages non chargées côté parent.
   * Requis pour que la recherche puisse demander le chargement des pages suivantes
   * quand le match n'est pas encore dans le buffer local.
   */
  hasMore?: boolean
  /**
   * Onglet actif : en recherche, ses résultats sont listés en premier.
   */
  priorityEntityTab?: ContextEntityTab
  /** Masquer la barre recherche/tri (fournie au-dessus des onglets). */
  showSearchBar?: boolean
  /** Recherche contrôlée par le parent (sinon état local). */
  searchQuery?: string
  onSearchQueryChange?: (value: string) => void
  sortType?: ContextSortType
  onSortTypeChange?: (value: ContextSortType) => void
  searchInputRef?: RefObject<HTMLInputElement | null>
}

type ContextListPropsWithTab = ContextListProps & {
  tabId?: string
}

function hasData(item: ContextListItem): item is ContextListItem & { data: Record<string, unknown> } {
  return 'data' in item && item.data != null && typeof item.data === 'object'
}

function itemKey(item: ContextListItem): string {
  return item.entityTab ? `${item.entityTab}:${item.name}` : item.name
}

function compareBySort(
  a: ContextListItem,
  b: ContextListItem,
  sortType: ContextSortType,
  isSelected: (item: ContextListItem) => boolean,
): number {
  switch (sortType) {
    case 'selected-first': {
      const aSelected = isSelected(a)
      const bSelected = isSelected(b)
      if (aSelected && !bSelected) return -1
      if (!aSelected && bSelected) return 1
      return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
    }
    case 'name-desc':
      return b.name.localeCompare(a.name, 'fr', { sensitivity: 'base' })
    case 'name-asc':
    default:
      return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
  }
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
  isItemSelected,
  tabId,
  showCheckboxes = true,
  entityTypeLabel,
  onScrollToBottom,
  loadingMore = false,
  hasMore = false,
  priorityEntityTab,
  showSearchBar = true,
  searchQuery: searchQueryControlled,
  onSearchQueryChange,
  sortType: sortTypeControlled,
  onSortTypeChange,
  searchInputRef: searchInputRefExternal,
}: ContextListPropsWithTab) {
  const [searchQueryLocal, setSearchQueryLocal] = useState('')
  const [sortTypeLocal, setSortTypeLocal] = useState<ContextSortType>('name-asc')
  const isSearchControlled = searchQueryControlled !== undefined
  const isSortControlled = sortTypeControlled !== undefined
  const searchQueryRaw = isSearchControlled ? searchQueryControlled : searchQueryLocal
  const sortType = isSortControlled ? sortTypeControlled : sortTypeLocal
  const debouncedSearch = useDebounce(searchQueryRaw, 300)
  const searchInputRefInternal = useRef<HTMLInputElement>(null)
  const searchInputRef = searchInputRefExternal ?? searchInputRefInternal
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const storageKey = tabId ? `context-list-scroll-${tabId}` : null

  const resolveSelected = useCallback(
    (item: ContextListItem): boolean => {
      if (isItemSelected) {
        return isItemSelected(item.name, item.entityTab)
      }
      return selectedItems.includes(item.name)
    },
    [isItemSelected, selectedItems],
  )

  const filteredItems = useMemo(() => {
    const query = searchQueryRaw.toLowerCase()
    let result = items.filter((item) => item.name.toLowerCase().includes(query))

    result = [...result].sort((a, b) => {
      if (query && priorityEntityTab) {
        const aPriority = a.entityTab === priorityEntityTab ? 0 : 1
        const bPriority = b.entityTab === priorityEntityTab ? 0 : 1
        if (aPriority !== bPriority) return aPriority - bPriority
      }
      return compareBySort(a, b, sortType, resolveSelected)
    })

    return result
  }, [items, searchQueryRaw, sortType, priorityEntityTab, resolveSelected])

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el || !onScrollToBottom) return
    const { scrollTop, scrollHeight, clientHeight } = el
    if (scrollHeight - (scrollTop + clientHeight) < 80) {
      onScrollToBottom()
    }
  }, [onScrollToBottom])

  // Recherche client-side sur buffer paginé : si aucun match local mais d'autres pages
  // existent, charger la suite (sinon "Aucun résultat" bloque le scroll infini).
  useEffect(() => {
    if (!debouncedSearch.trim()) return
    if (filteredItems.length > 0) return
    if (!hasMore || loadingMore || !onScrollToBottom) return
    onScrollToBottom()
  }, [
    debouncedSearch,
    filteredItems.length,
    hasMore,
    loadingMore,
    onScrollToBottom,
    items.length,
  ])

  useEffect(() => {
    if (!showSearchBar) return
    const handleKeyDown = (e: KeyboardEvent) => {
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
  }, [searchInputRef, showSearchBar])

  useEffect(() => {
    if (storageKey && scrollContainerRef.current) {
      const savedScroll = sessionStorage.getItem(storageKey)
      if (savedScroll) {
        scrollContainerRef.current.scrollTop = parseInt(savedScroll, 10)
      }
    }
  }, [storageKey])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container || !storageKey) return

    const handleScrollSave = () => {
      sessionStorage.setItem(storageKey, container.scrollTop.toString())
    }

    container.addEventListener('scroll', handleScrollSave, { passive: true })
    return () => container.removeEventListener('scroll', handleScrollSave)
  }, [storageKey])

  const setSearchQuery = (value: string) => {
    if (onSearchQueryChange) {
      onSearchQueryChange(value)
      return
    }
    setSearchQueryLocal(value)
  }

  const setSortType = (value: ContextSortType) => {
    if (onSortTypeChange) {
      onSortTypeChange(value)
      return
    }
    setSortTypeLocal(value)
  }

  if (isLoading) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center', color: theme.text.secondary }}>
        <div>Chargement...</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {showSearchBar && (
        <ContextSearchControls
          searchQuery={searchQueryRaw}
          onSearchQueryChange={setSearchQuery}
          sortType={sortType}
          onSortTypeChange={setSortType}
          inputRef={searchInputRef}
          placeholder="Rechercher... (/)"
        />
      )}
      <div
        ref={scrollContainerRef}
        data-testid="context-list-scroll"
        onScroll={handleScroll}
        style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0.65rem', minHeight: 0 }}
      >
        {filteredItems.length === 0 ? (
          <div style={{ padding: '1rem', textAlign: 'center', color: theme.text.secondary }}>
            {searchQueryRaw.trim()
              ? hasMore || loadingMore
                ? 'Recherche dans le catalogue…'
                : 'Aucun résultat'
              : 'Aucun élément'}
          </div>
        ) : (
          <>
            {filteredItems.map((item) => {
              const isSelected = resolveSelected(item)
              const isDetailSelected = selectedDetail === item.name
              const currentMode = getElementMode
                ? getElementMode(item.name, item.entityTab)
                : null
              const selectionStyle = listItemSelectionStyle(isSelected)
              const badgeLabel = item.entityTypeLabel ?? entityTypeLabel

              const handleModeClick = (e: React.MouseEvent) => {
                e.stopPropagation()
                if (onModeChange && isSelected && currentMode) {
                  const newMode: ElementMode = currentMode === 'full' ? 'excerpt' : 'full'
                  onModeChange(item.name, newMode, item.entityTab)
                }
              }

              return (
                <div
                  key={itemKey(item)}
                  style={{
                    padding: '11px 20px',
                    borderTop: listRowHairlineBorder,
                    borderRadius: 0,
                    ...selectionStyle,
                    backgroundColor: isSelected
                      ? selectionStyle.backgroundColor
                      : isDetailSelected
                        ? listRowHoverBackground
                        : 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.5rem',
                    position: 'relative',
                    transition: 'background-color 0.15s ease, opacity 0.15s ease',
                  }}
                  onClick={() => onItemClick(item.name, item.entityTab)}
                  onMouseEnter={(e) => {
                    if (!isSelected && !isDetailSelected) {
                      e.currentTarget.style.backgroundColor = listRowHoverBackground
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected && !isDetailSelected) {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }
                  }}
                >
                  {showCheckboxes && (
                    // La maquette 1c n'affiche pas de case, mais le clic sur la rangée ouvre le
                    // détail : sans elle, plus aucun moyen de sélectionner. On garde donc la case,
                    // au format discret de 1a/1b (13px, accent quand cochée).
                    <input
                      type="checkbox"
                      checked={isSelected}
                      aria-label={`Sélectionner ${item.name}`}
                      onChange={(e) => {
                        e.stopPropagation()
                        onItemToggle(item.name, item.entityTab)
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        width: 13,
                        height: 13,
                        marginTop: 2,
                        flexShrink: 0,
                        accentColor: redesignAccent.base,
                        cursor: 'pointer',
                      }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: '13.5px',
                          fontWeight: isSelected ? 500 : 400,
                          color: isSelected ? redesignText.strong : redesignText.row,
                        }}
                      >
                        {highlightText(item.name, searchQueryRaw)}
                      </span>
                      {badgeLabel && (
                        <span
                          style={{
                            fontFamily: redesignFont.mono,
                            fontSize: remSize('caption'),
                            letterSpacing: '0.09em',
                            textTransform: 'uppercase',
                            color: redesignText.label,
                          }}
                        >
                          {badgeLabel}
                        </span>
                      )}
                    </span>
                    {hasData(item) && getGddEntitySummary(item.data) && (
                      <span
                        style={{
                          fontSize: '12px',
                          color: isSelected ? redesignText.secondary : redesignText.muted,
                          lineHeight: 1.4,
                        }}
                      >
                        {getGddEntitySummary(item.data)}
                      </span>
                    )}
                  </div>
                  {isSelected && currentMode && onModeChange && (
                    <button
                      type="button"
                      onClick={handleModeClick}
                      title={
                        currentMode === 'full'
                          ? 'Complet - Cliquer pour passer en Extrait'
                          : 'Extrait - Cliquer pour passer en Complet'
                      }
                      style={{
                        padding: '0.15rem 0.45rem',
                        border: 'none',
                        borderRadius: 0,
                        backgroundColor: 'transparent',
                        color:
                          currentMode === 'excerpt'
                            ? redesignText.muted
                            : redesignAccent.base,
                        cursor: 'pointer',
                        fontFamily: redesignFont.mono,
                        fontSize: '9.5px',
                        letterSpacing: '0.08em',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        flexShrink: 0,
                      }}
                    >
                      {currentMode === 'full' ? 'COMPLET' : 'EXTRAIT'}
                    </button>
                  )}
                </div>
              )
            })}
            {loadingMore && (
              <div
                style={{
                  padding: '0.75rem',
                  textAlign: 'center',
                  color: theme.text.secondary,
                  fontSize: remSize('body'),
                }}
              >
                Chargement…
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
