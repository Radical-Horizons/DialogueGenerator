/**
 * Composant principal de sélection de contexte (panneau Contexte GDD) avec onglets par type d'entité.
 * AC FR11 : Personnages, Lieux (contexte), Objets, Espèces, Communautés.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import * as contextAPI from '../../api/context'
import type { 
  CharacterResponse, 
  LocationResponse, 
  ItemResponse,
  SpeciesResponse,
  CommunityResponse,
} from '../../types/api'
import { ContextList } from './ContextList'
import type { ContextListItem } from './ContextList'

/** Affiche aussi les noms sélectionnés absents du catalogue API (GDD vide / preset). */
function mergeListWithSelectedNames(
  items: ContextListItem[],
  selectedNames: string[],
): ContextListItem[] {
  const seen = new Set(items.map((i) => i.name))
  const prepend: ContextListItem[] = []
  for (const name of selectedNames) {
    if (name && !seen.has(name)) {
      prepend.push({ name, data: {} })
      seen.add(name)
    }
  }
  return [...prepend, ...items]
}
import { SelectedContextSummary } from './SelectedContextSummary'
import type { EntityType } from './SelectedContextSummary'
import { ContextSuggestionsPanel } from './ContextSuggestionsPanel'
import { ContextRulesEditor } from './ContextRulesEditor'
import { ContextRelevancePanel } from './ContextRelevancePanel'
import { ContextUsagePanel } from './ContextUsagePanel'
import { ContextTokenBudgetSection } from './ContextTokenBudgetSection'
import { useContextStore } from '../../store/contextStore'
import { useContextRulesStore } from '../../store/contextRulesStore'
import { getErrorMessage } from '../../types/errors'
import { theme } from '../../theme'

type TabType = 'characters' | 'locations' | 'items' | 'species' | 'communities'

/** Stem fichier catégorie GDD pour l’API historique (Story 3.9). */
const HISTORY_CATEGORY_BY_TAB: Record<TabType, string> = {
  characters: 'personnages',
  locations: 'lieux',
  items: 'objets',
  species: 'especes',
  communities: 'communautes',
}

type ContextItem = CharacterResponse | LocationResponse | ItemResponse | SpeciesResponse | CommunityResponse

const PAGE_SIZE = 50

const TAB_DEFS: { key: TabType; label: string }[] = [
  { key: 'characters', label: 'Personnages' },
  { key: 'locations',  label: 'Lieux' },
  { key: 'items',      label: 'Objets' },
  { key: 'species',    label: 'Espèces' },
  { key: 'communities', label: 'Communautés' },
]

const ENTITY_TYPE_LABELS: Record<TabType, string> = {
  characters: 'Personnage',
  locations: 'Lieu',
  items: 'Objet',
  species: 'Espèce',
  communities: 'Communauté',
}

/** Mapping onglet → clé du store (pour isElementSelected). */
const STORE_TYPE_MAP: Partial<Record<TabType, 'characters' | 'locations' | 'items' | 'species' | 'communities'>> = {
  characters: 'characters',
  locations: 'locations',
  items: 'items',
  species: 'species',
  communities: 'communities',
}

/** Mapping onglet → trigger_type envoyé à l'API suggestions. */
const TRIGGER_TYPE_MAP: Partial<Record<TabType, string>> = {
  characters: 'character',
  locations: 'location',
  items: 'item',
  species: 'species',
  communities: 'community',
}

// ---------------------------------------------------------------------------
// Hook overflow : détermine combien d'onglets tiennent dans la barre
// ---------------------------------------------------------------------------

const GEAR_BTN_W = 38    // px réservés pour le bouton ⚙
const OVERFLOW_BTN_W = 44 // px réservés pour le bouton "▾ N"
const TAB_CHAR_PX = 7.5  // px approximatif par caractère (font ~0.85rem)
const TAB_PAD_PX = 22    // padding fixe par onglet

function estimateTabWidth(label: string): number {
  return Math.ceil(label.length * TAB_CHAR_PX) + TAB_PAD_PX
}

function useTabOverflow(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [visibleCount, setVisibleCount] = useState(TAB_DEFS.length)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const compute = (availableWidth: number) => {
      // Largeur inconnue (ex : JSDOM) → afficher tous les onglets par défaut
      if (availableWidth <= 0) {
        setVisibleCount(TAB_DEFS.length)
        return
      }
      let used = GEAR_BTN_W
      let count = 0
      for (let i = 0; i < TAB_DEFS.length; i++) {
        const tabW = estimateTabWidth(TAB_DEFS[i].label)
        // Réserver la place du bouton overflow sauf si tous les tabs tiennent
        const allFit = used + tabW + estimateTabWidth(TAB_DEFS[i + 1]?.label ?? '') <= availableWidth
        const overflowReserved = i < TAB_DEFS.length - 1 && !allFit ? OVERFLOW_BTN_W : 0
        if (used + tabW + overflowReserved > availableWidth && count > 0) break
        used += tabW
        count++
      }
      setVisibleCount(Math.max(1, count))
    }

    const ro = new ResizeObserver(([entry]) => compute(entry.contentRect.width))
    ro.observe(el)
    compute(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [containerRef])

  return visibleCount
}

interface ContextSelectorProps {
  onItemSelected?: (item: ContextItem | null, historyCategoryStem?: string | null) => void
}

export function ContextSelector({ onItemSelected }: ContextSelectorProps = {}) {
  const [activeTab, setActiveTab] = useState<TabType>('characters')
  const [showRulesEditor, setShowRulesEditor] = useState(false)
  const [characters, setCharacters] = useState<CharacterResponse[]>([])
  const [locations, setLocations] = useState<LocationResponse[]>([])
  const [items, setItems] = useState<ItemResponse[]>([])
  const [species, setSpecies] = useState<SpeciesResponse[]>([])
  const [communities, setCommunities] = useState<CommunityResponse[]>([])
  const [selectedDetail, setSelectedDetail] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showOverflowMenu, setShowOverflowMenu] = useState(false)
  const tabBarRef = useRef<HTMLDivElement>(null)
  const overflowMenuRef = useRef<HTMLDivElement>(null)
  const visibleTabCount = useTabOverflow(tabBarRef)
  const [charactersPage, setCharactersPage] = useState(1)
  const [charactersTotalPages, setCharactersTotalPages] = useState(1)
  const [locationsPage, setLocationsPage] = useState(1)
  const [locationsTotalPages, setLocationsTotalPages] = useState(1)
  const [itemsPage, setItemsPage] = useState(1)
  const [itemsTotalPages, setItemsTotalPages] = useState(1)
  const [communitiesPage, setCommunitiesPage] = useState(1)
  const [communitiesTotalPages, setCommunitiesTotalPages] = useState(1)
  const [loadingMore, setLoadingMore] = useState(false)

  const { 
    selections, 
    toggleCharacter, 
    toggleLocation, 
    toggleItem, 
    toggleSpecies,
    toggleCommunity,
    clearSelections,
    setElementLists,
    getElementMode,
    setElementMode,
    isElementSelected,
    setSuggestions,
    refreshSuggestionsForTrigger,
    gddDataRevision,
  } = useContextStore()
  const selectedDialogueType = useContextRulesStore((s) => s.selectedDialogueType)

  // Ferme le menu overflow si l'utilisateur clique en dehors
  useEffect(() => {
    if (!showOverflowMenu) return
    const handler = (e: MouseEvent) => {
      if (overflowMenuRef.current && !overflowMenuRef.current.contains(e.target as Node)) {
        setShowOverflowMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showOverflowMenu])

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [charsRes, locsRes, itemsRes, speciesRes, communitiesRes] = await Promise.all([
        contextAPI.listCharacters({ page: 1, page_size: PAGE_SIZE }),
        contextAPI.listLocations({ page: 1, page_size: PAGE_SIZE }),
        contextAPI.listItems({ page: 1, page_size: PAGE_SIZE }),
        contextAPI.listSpecies(),
        contextAPI.listCommunities({ page: 1, page_size: PAGE_SIZE }),
      ])
      setCharacters(charsRes.characters)
      setCharactersPage(1)
      setCharactersTotalPages(charsRes.total_pages ?? 1)
      setLocations(locsRes.locations)
      setLocationsPage(1)
      setLocationsTotalPages(locsRes.total_pages ?? 1)
      setItems(itemsRes.items)
      setItemsPage(1)
      setItemsTotalPages(itemsRes.total_pages ?? 1)
      setSpecies(speciesRes.species)
      setCommunities(communitiesRes.communities)
      setCommunitiesPage(1)
      setCommunitiesTotalPages(communitiesRes.total_pages ?? 1)

      setElementLists({
        characters: charsRes.characters,
        locations: locsRes.locations,
        items: itemsRes.items,
        species: speciesRes.species,
        communities: communitiesRes.communities,
      })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }, [setElementLists])

  const loadMore = useCallback(async () => {
    if (loadingMore) return
    if (activeTab === 'characters' && charactersPage >= charactersTotalPages) return
    if (activeTab === 'locations' && locationsPage >= locationsTotalPages) return
    if (activeTab === 'items' && itemsPage >= itemsTotalPages) return
    if (activeTab === 'communities' && communitiesPage >= communitiesTotalPages) return
    if (activeTab === 'species') return

    setLoadingMore(true)
    try {
      if (activeTab === 'characters') {
        const res = await contextAPI.listCharacters({ page: charactersPage + 1, page_size: PAGE_SIZE })
        setCharacters((prev) => [...prev, ...res.characters])
        setCharactersPage((p) => p + 1)
      } else if (activeTab === 'locations') {
        const res = await contextAPI.listLocations({ page: locationsPage + 1, page_size: PAGE_SIZE })
        setLocations((prev) => [...prev, ...res.locations])
        setLocationsPage((p) => p + 1)
      } else if (activeTab === 'items') {
        const res = await contextAPI.listItems({ page: itemsPage + 1, page_size: PAGE_SIZE })
        setItems((prev) => [...prev, ...res.items])
        setItemsPage((p) => p + 1)
      } else if (activeTab === 'communities') {
        const res = await contextAPI.listCommunities({ page: communitiesPage + 1, page_size: PAGE_SIZE })
        setCommunities((prev) => [...prev, ...res.communities])
        setCommunitiesPage((p) => p + 1)
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoadingMore(false)
    }
  }, [
    loadingMore,
    activeTab,
    charactersPage,
    charactersTotalPages,
    locationsPage,
    locationsTotalPages,
    itemsPage,
    itemsTotalPages,
    communitiesPage,
    communitiesTotalPages,
  ])

  useEffect(() => {
    void loadData()
  }, [loadData, gddDataRevision])

  const handleItemClick = async (name: string) => {
    try {
      let item: ContextItem | { name: string; data: Record<string, unknown> } | null = null
      if (activeTab === 'characters') {
        item = await contextAPI.getCharacter(name)
      } else if (activeTab === 'locations') {
        item = await contextAPI.getLocation(name)
      } else if (activeTab === 'items') {
        item = await contextAPI.getItem(name)
      } else if (activeTab === 'species') {
        item = await contextAPI.getSpecies(name)
      } else if (activeTab === 'communities') {
        item = await contextAPI.getCommunity(name)
      }

      const stem = HISTORY_CATEGORY_BY_TAB[activeTab]
      if (item && selectedDetail === name) {
        setSelectedDetail(null)
        onItemSelected?.(item as ContextItem, stem)
      } else if (item) {
        setSelectedDetail(name)
        onItemSelected?.(item as ContextItem, stem)
      }
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const handleItemToggle = (name: string) => {
    const storeKey = STORE_TYPE_MAP[activeTab]
    const wasSelected = storeKey ? isElementSelected(storeKey, name) : false

    if (activeTab === 'characters') {
      toggleCharacter(name)
    } else if (activeTab === 'locations') {
      toggleLocation(name)
    } else if (activeTab === 'items') {
      toggleItem(name)
    } else if (activeTab === 'species') {
      toggleSpecies(name)
    } else if (activeTab === 'communities') {
      toggleCommunity(name)
    }
    if (selectedDetail === name) {
      setSelectedDetail(null)
      onItemSelected?.(null, null)
    }

    if (!wasSelected) {
      const triggerType = TRIGGER_TYPE_MAP[activeTab]
      if (triggerType) {
        refreshSuggestionsForTrigger(triggerType, name, selectedDialogueType)
      }
    } else {
      setSuggestions([])
    }
  }

  const getCurrentItems = (): ContextListItem[] => {
    if (activeTab === 'characters') {
      return mergeListWithSelectedNames(characters, [
        ...(selections.characters_full ?? []),
        ...(selections.characters_excerpt ?? []),
      ])
    }
    if (activeTab === 'locations') {
      return mergeListWithSelectedNames(locations, [
        ...(selections.locations_full ?? []),
        ...(selections.locations_excerpt ?? []),
      ])
    }
    if (activeTab === 'items') {
      return mergeListWithSelectedNames(items, [
        ...(selections.items_full ?? []),
        ...(selections.items_excerpt ?? []),
      ])
    }
    if (activeTab === 'species') {
      return mergeListWithSelectedNames(species, [
        ...(selections.species_full ?? []),
        ...(selections.species_excerpt ?? []),
      ])
    }
    if (activeTab === 'communities') {
      return mergeListWithSelectedNames(communities, [
        ...(selections.communities_full ?? []),
        ...(selections.communities_excerpt ?? []),
      ])
    }
    return []
  }

  const getSelectedItems = (): string[] => {
    if (activeTab === 'characters') {
      return [
        ...(Array.isArray(selections.characters_full) ? selections.characters_full : []),
        ...(Array.isArray(selections.characters_excerpt) ? selections.characters_excerpt : [])
      ]
    }
    if (activeTab === 'locations') {
      return [
        ...(Array.isArray(selections.locations_full) ? selections.locations_full : []),
        ...(Array.isArray(selections.locations_excerpt) ? selections.locations_excerpt : [])
      ]
    }
    if (activeTab === 'items') {
      return [
        ...(Array.isArray(selections.items_full) ? selections.items_full : []),
        ...(Array.isArray(selections.items_excerpt) ? selections.items_excerpt : [])
      ]
    }
    if (activeTab === 'species') {
      return [
        ...(Array.isArray(selections.species_full) ? selections.species_full : []),
        ...(Array.isArray(selections.species_excerpt) ? selections.species_excerpt : [])
      ]
    }
    if (activeTab === 'communities') {
      return [
        ...(Array.isArray(selections.communities_full) ? selections.communities_full : []),
        ...(Array.isArray(selections.communities_excerpt) ? selections.communities_excerpt : [])
      ]
    }
    return []
  }

  const handleModeChange = (name: string, mode: 'full' | 'excerpt') => {
    if (activeTab === 'characters') {
      setElementMode('characters', name, mode)
    } else if (activeTab === 'locations') {
      setElementMode('locations', name, mode)
    } else if (activeTab === 'items') {
      setElementMode('items', name, mode)
    } else if (activeTab === 'species') {
      setElementMode('species', name, mode)
    } else if (activeTab === 'communities') {
      setElementMode('communities', name, mode)
    }
  }

  const handleRemoveEntity = useCallback((entityType: EntityType, name: string) => {
    if (entityType === 'characters') toggleCharacter(name)
    else if (entityType === 'locations') toggleLocation(name)
    else if (entityType === 'items') toggleItem(name)
    else if (entityType === 'species') toggleSpecies(name)
    else if (entityType === 'communities') toggleCommunity(name)
  }, [toggleCharacter, toggleLocation, toggleItem, toggleSpecies, toggleCommunity])

  const handleSelectionPanelModeChange = useCallback((entityType: EntityType, name: string, mode: 'full' | 'excerpt') => {
    setElementMode(entityType, name, mode)
  }, [setElementMode])

  const getElementModeForList = (name: string): 'full' | 'excerpt' | null => {
    if (activeTab === 'characters') return getElementMode('characters', name)
    if (activeTab === 'locations') return getElementMode('locations', name)
    if (activeTab === 'items') return getElementMode('items', name)
    if (activeTab === 'species') return getElementMode('species', name)
    if (activeTab === 'communities') return getElementMode('communities', name)
    return null
  }

  return (
    <div
      data-testid="context-selector"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        maxHeight: '100%',
        minHeight: 0,
        overflow: 'hidden',
        boxSizing: 'border-box',
        // Évite les troncatures de 1–2px dues aux arrondis (100vh/calc/zoom) quand un parent clippe.
        paddingBottom: 4,
      }}
    >
      {/* Barre d'onglets avec overflow dynamique */}
      <div
        ref={tabBarRef}
        style={{ flexShrink: 0, display: 'flex', borderBottom: `1px solid ${theme.border.primary}`, position: 'relative' }}
      >
        {/* Onglets visibles */}
        {TAB_DEFS.slice(0, visibleTabCount).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { setActiveTab(key); setSelectedDetail(null); onItemSelected?.(null, null) }}
            style={{
              flex: 1,
              padding: '0.75rem 0.4rem',
              border: 'none',
              borderBottom: activeTab === key ? `2px solid ${theme.button.primary.background}` : 'none',
              backgroundColor: activeTab === key ? theme.background.tertiary : 'transparent',
              color: theme.text.primary,
              cursor: 'pointer',
              fontWeight: activeTab === key ? 'bold' : 'normal',
              fontSize: '0.85rem',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: 0,
            }}
          >
            {label}
          </button>
        ))}

        {/* Bouton overflow "▾ N" — visible quand des onglets débordent */}
        {visibleTabCount < TAB_DEFS.length && (() => {
          const overflowTabs = TAB_DEFS.slice(visibleTabCount)
          const overflowHasActive = overflowTabs.some(t => t.key === activeTab)
          return (
            <div ref={overflowMenuRef} style={{ position: 'relative', flexShrink: 0 }}>
              <button
                data-testid="btn-overflow-tabs"
                aria-label="Plus d'onglets"
                aria-expanded={showOverflowMenu}
                onClick={() => setShowOverflowMenu(v => !v)}
                style={{
                  padding: '0.75rem 0.5rem',
                  border: 'none',
                  borderBottom: overflowHasActive ? `2px solid ${theme.button.primary.background}` : 'none',
                  backgroundColor: overflowHasActive ? theme.background.tertiary : 'transparent',
                  color: theme.text.primary,
                  cursor: 'pointer',
                  fontWeight: overflowHasActive ? 'bold' : 'normal',
                  fontSize: '0.85rem',
                  whiteSpace: 'nowrap',
                }}
              >
                ▾ {overflowTabs.length}
              </button>
              {showOverflowMenu && (
                <div
                  role="menu"
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    backgroundColor: theme.background.secondary,
                    border: `1px solid ${theme.border.primary}`,
                    borderRadius: 4,
                    zIndex: 200,
                    minWidth: '9rem',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                  }}
                >
                  {overflowTabs.map(({ key, label }) => (
                    <button
                      key={key}
                      role="menuitem"
                      onClick={() => { setActiveTab(key); setSelectedDetail(null); onItemSelected?.(null, null); setShowOverflowMenu(false) }}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '0.6rem 0.9rem',
                        border: 'none',
                        borderLeft: activeTab === key ? `3px solid ${theme.button.primary.background}` : '3px solid transparent',
                        backgroundColor: activeTab === key ? theme.background.tertiary : 'transparent',
                        color: theme.text.primary,
                        cursor: 'pointer',
                        fontWeight: activeTab === key ? 'bold' : 'normal',
                        fontSize: '0.85rem',
                        textAlign: 'left',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })()}

        {/* Bouton Règles (Story 3.4) — toujours visible */}
        <button
          data-testid="btn-toggle-rules"
          aria-label="Règles de sélection"
          aria-pressed={showRulesEditor}
          onClick={() => setShowRulesEditor(v => !v)}
          title="Règles de sélection de contexte"
          style={{
            flexShrink: 0,
            padding: '0.75rem 0.5rem',
            border: 'none',
            borderBottom: showRulesEditor ? `2px solid ${theme.button.primary.background}` : 'none',
            backgroundColor: showRulesEditor ? theme.background.tertiary : 'transparent',
            color: theme.text.primary,
            cursor: 'pointer',
            fontSize: '1rem',
          }}
        >
          ⚙
        </button>
      </div>

      {/* Éditeur de règles — masqué par défaut */}
      {showRulesEditor && <ContextRulesEditor />}

      {error && (
        <div style={{ 
          flexShrink: 0,
          padding: '0.5rem', 
          backgroundColor: theme.state.error.background, 
          color: theme.state.error.color, 
          fontSize: '0.9rem' 
        }}>
          {error}
        </div>
      )}

      <ContextSuggestionsPanel />

      <div style={{ flex: '1 1 0', overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
        <ContextList
          items={getCurrentItems()}
          selectedItems={getSelectedItems()}
          onItemClick={handleItemClick}
          onItemToggle={handleItemToggle}
          selectedDetail={selectedDetail}
          onSelectDetail={setSelectedDetail}
          isLoading={isLoading}
          getElementMode={getElementModeForList}
          onModeChange={handleModeChange}
          tabId={activeTab}
          showCheckboxes
          entityTypeLabel={ENTITY_TYPE_LABELS[activeTab]}
          onScrollToBottom={loadMore}
          loadingMore={loadingMore}
        />
      </div>
      <ContextTokenBudgetSection />
      <div style={{ flex: '0 0 auto' }}>
        <SelectedContextSummary 
          selections={selections} 
          onClear={clearSelections}
          onRemoveEntity={handleRemoveEntity}
          onModeChange={handleSelectionPanelModeChange}
          onError={(err) => setError(err)}
          onSuccess={() => setError(null)}
        />
      </div>
      <details
        data-testid="context-llm-diagnostics"
        style={{
          flexShrink: 0,
          borderTop: `1px solid ${theme.border.primary}`,
          backgroundColor: theme.background.secondary,
        }}
      >
        <summary
          style={{
            padding: '0.45rem 0.75rem',
            cursor: 'pointer',
            fontSize: '0.78rem',
            fontWeight: 600,
            color: theme.text.primary,
            listStyle: 'none',
          }}
        >
          Diagnostic LLM — pertinence et sections GDD
        </summary>
        <div>
          <ContextRelevancePanel embedded />
          <ContextUsagePanel />
        </div>
      </details>
    </div>
  )
}

