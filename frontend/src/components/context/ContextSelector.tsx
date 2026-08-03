/**
 * Composant principal de sélection de contexte (panneau Contexte GDD) avec onglets par type d'entité.
 * AC FR11 : Personnages, Lieux (contexte), Objets, Espèces, Communautés.
 */
import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react'
import type { CSSProperties } from 'react'
import * as contextAPI from '../../api/context'
import type { 
  CharacterResponse, 
  LocationResponse, 
  ItemResponse,
  SpeciesResponse,
  CommunityResponse,
  NarrativeContextResponse,
} from '../../types/api'
import { ContextList } from './ContextList'
import type { ContextEntityTab, ContextListItem } from './ContextList'
import { ContextSearchControls, type ContextSortType } from './ContextSearchControls'
import {
  resolveCharacterCanonicalName,
  resolveGddCanonicalName,
  resolveLocationCanonicalName,
} from '../../utils/gddEntityNames'

/** Affiche aussi les noms sélectionnés absents du catalogue API (GDD vide / preset). */
function mergeListWithSelectedNames(
  items: ContextListItem[],
  selectedNames: string[],
  resolveName: (name: string) => string = (n) => n,
): ContextListItem[] {
  const seen = new Set(items.map((i) => i.name))
  const seenCanonical = new Set(items.map((i) => resolveName(i.name)))
  const prepend: ContextListItem[] = []
  for (const name of selectedNames) {
    const canonical = resolveName(name)
    if (!name || seen.has(name) || seenCanonical.has(canonical)) {
      continue
    }
    prepend.push({ name: canonical, data: {} })
    seen.add(canonical)
    seenCanonical.add(canonical)
  }
  return [...prepend, ...items]
}
import { SelectedContextSummary } from './SelectedContextSummary'
import type { EntityType } from './SelectedContextSummary'
import { ContextSuggestionsPanel } from './ContextSuggestionsPanel'
import { ContextPanelAccordionGroup, ContextPanelAccordionSection } from './ContextPanelAccordion'
import { ContextRulesEditor } from './ContextRulesEditor'
import { ContextRelevancePanel } from './ContextRelevancePanel'
import { ContextUsagePanel } from './ContextUsagePanel'
import { useContextStore } from '../../store/contextStore'
import { useContextRulesStore } from '../../store/contextRulesStore'
import { getErrorMessage } from '../../types/errors'
import { theme } from '../../theme'
import { remSize } from '../../theme/uiTypography'
import { contextGddTabChrome, type ContextGddTabDensity } from '../../theme/responsiveChrome'
import type { UiFontRemKey } from '../../theme/uiTypography'
import { redesignFont } from '../../theme/redesignTokens'

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
type NarrativeCategory = 'narrative_structures' | 'chapters' | 'scenes'

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

/** Bascule `balanced` → `tight` si la barre déborde (proposition 3). */
function useContextGddTabBarDensity(tabBarRef: React.RefObject<HTMLDivElement | null>) {
  const [density, setDensity] = useState<ContextGddTabDensity>('balanced')

  const measure = useCallback(() => {
    const el = tabBarRef.current
    if (!el) return
    const overflows = el.scrollWidth > el.clientWidth + 1
    if (overflows) {
      setDensity('tight')
      return
    }
    if (el.clientWidth >= contextGddTabChrome.relaxToBalancedMinWidthPx) {
      setDensity('balanced')
    }
  }, [tabBarRef])

  useLayoutEffect(() => {
    measure()
  }, [measure, density])

  useEffect(() => {
    const el = tabBarRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(measure)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure, tabBarRef])

  return density
}

function contextGddTabButtonStyle(
  isActive: boolean,
  tier: (typeof contextGddTabChrome)['balanced'],
  tabFontKey: UiFontRemKey,
): CSSProperties {
  return {
    flex: '1 1 auto',
    minWidth: 0,
    minHeight: tier.tabMinHeightPx,
    padding: tier.tabPadding,
    border: 'none',
    borderRadius: tier.borderRadiusPx,
    borderBottom: isActive
      ? `2px solid ${theme.button.primary.background}`
      : '2px solid transparent',
    backgroundColor: isActive ? theme.background.tertiary : 'transparent',
    color: theme.text.primary,
    cursor: 'pointer',
    fontWeight: isActive ? 600 : 400,
    fontSize: remSize(tabFontKey),
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  }
}

interface ContextSelectorProps {
  onItemSelected?: (item: ContextItem | null, historyCategoryStem?: string | null) => void
  onLoadStateChange?: (state: {
    isLoading: boolean
    error: string | null
    refresh: () => void
  }) => void
}

export function ContextSelector({ onItemSelected, onLoadStateChange }: ContextSelectorProps = {}) {
  const [activeTab, setActiveTab] = useState<TabType>('characters')
  const [showRulesEditor, setShowRulesEditor] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortType, setSortType] = useState<ContextSortType>('name-asc')
  const [characters, setCharacters] = useState<CharacterResponse[]>([])
  const [locations, setLocations] = useState<LocationResponse[]>([])
  const [items, setItems] = useState<ItemResponse[]>([])
  const [species, setSpecies] = useState<SpeciesResponse[]>([])
  const [communities, setCommunities] = useState<CommunityResponse[]>([])
  const [narrativeContexts, setNarrativeContexts] = useState<NarrativeContextResponse[]>([])
  const [selectedDetail, setSelectedDetail] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hoveredTab, setHoveredTab] = useState<TabType | null>(null)
  const tabBarRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const tabBarDensity = useContextGddTabBarDensity(tabBarRef)
  const tabChromeTier = contextGddTabChrome[tabBarDensity]
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
    toggleNarrativeContext,
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

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [charsRes, locsRes, itemsRes, speciesRes, communitiesRes, narrativeRes] = await Promise.all([
        contextAPI.listCharacters({ page: 1, page_size: PAGE_SIZE }),
        contextAPI.listLocations({ page: 1, page_size: PAGE_SIZE }),
        contextAPI.listItems({ page: 1, page_size: PAGE_SIZE }),
        contextAPI.listSpecies(),
        contextAPI.listCommunities({ page: 1, page_size: PAGE_SIZE }),
        contextAPI.listNarrativeContexts(),
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
      setNarrativeContexts(narrativeRes.items)
      setCommunitiesPage(1)
      setCommunitiesTotalPages(communitiesRes.total_pages ?? 1)

      setElementLists({
        characters: charsRes.characters,
        locations: locsRes.locations,
        items: itemsRes.items,
        species: speciesRes.species,
        communities: communitiesRes.communities,
        narrativeContexts: narrativeRes.items,
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

  /** Pendant une recherche inter-onglets, avance toutes les pages encore incomplètes. */
  const loadMoreForSearch = useCallback(async () => {
    if (loadingMore) return
    const canCharacters = charactersPage < charactersTotalPages
    const canLocations = locationsPage < locationsTotalPages
    const canItems = itemsPage < itemsTotalPages
    const canCommunities = communitiesPage < communitiesTotalPages
    if (!canCharacters && !canLocations && !canItems && !canCommunities) return

    setLoadingMore(true)
    try {
      const tasks: Promise<void>[] = []
      if (canCharacters) {
        tasks.push(
          contextAPI.listCharacters({ page: charactersPage + 1, page_size: PAGE_SIZE }).then((res) => {
            setCharacters((prev) => [...prev, ...res.characters])
            setCharactersPage((p) => p + 1)
          }),
        )
      }
      if (canLocations) {
        tasks.push(
          contextAPI.listLocations({ page: locationsPage + 1, page_size: PAGE_SIZE }).then((res) => {
            setLocations((prev) => [...prev, ...res.locations])
            setLocationsPage((p) => p + 1)
          }),
        )
      }
      if (canItems) {
        tasks.push(
          contextAPI.listItems({ page: itemsPage + 1, page_size: PAGE_SIZE }).then((res) => {
            setItems((prev) => [...prev, ...res.items])
            setItemsPage((p) => p + 1)
          }),
        )
      }
      if (canCommunities) {
        tasks.push(
          contextAPI.listCommunities({ page: communitiesPage + 1, page_size: PAGE_SIZE }).then((res) => {
            setCommunities((prev) => [...prev, ...res.communities])
            setCommunitiesPage((p) => p + 1)
          }),
        )
      }
      await Promise.all(tasks)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoadingMore(false)
    }
  }, [
    loadingMore,
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

  useEffect(() => {
    onLoadStateChange?.({
      isLoading,
      error,
      refresh: () => {
        void loadData()
      },
    })
  }, [error, isLoading, loadData, onLoadStateChange])

  useEffect(() => {
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
  }, [])

  const handleItemClick = async (name: string, entityTab?: ContextEntityTab) => {
    const tab = (entityTab ?? activeTab) as TabType
    if (tab !== activeTab) {
      setActiveTab(tab)
    }
    try {
      let item: ContextItem | { name: string; data: Record<string, unknown> } | null = null
      if (tab === 'characters') {
        item = await contextAPI.getCharacter(name)
      } else if (tab === 'locations') {
        item = await contextAPI.getLocation(name)
      } else if (tab === 'items') {
        item = await contextAPI.getItem(name)
      } else if (tab === 'species') {
        item = await contextAPI.getSpecies(name)
      } else if (tab === 'communities') {
        item = await contextAPI.getCommunity(name)
      }

      const stem = HISTORY_CATEGORY_BY_TAB[tab]
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

  const handleItemToggle = (name: string, entityTab?: ContextEntityTab) => {
    const tab = (entityTab ?? activeTab) as TabType
    if (tab !== activeTab) {
      setActiveTab(tab)
    }
    const storeKey = STORE_TYPE_MAP[tab]
    const wasSelected = storeKey ? isElementSelected(storeKey, name) : false

    if (tab === 'characters') {
      toggleCharacter(name)
    } else if (tab === 'locations') {
      toggleLocation(name)
    } else if (tab === 'items') {
      toggleItem(name)
    } else if (tab === 'species') {
      toggleSpecies(name)
    } else if (tab === 'communities') {
      toggleCommunity(name)
    }
    if (selectedDetail === name) {
      setSelectedDetail(null)
      onItemSelected?.(null, null)
    }

    if (!wasSelected) {
      const triggerType = TRIGGER_TYPE_MAP[tab]
      if (triggerType) {
        refreshSuggestionsForTrigger(triggerType, name, selectedDialogueType)
      }
    } else {
      setSuggestions([])
    }
  }

  const tagCatalogItems = useCallback((catalog: ContextListItem[], tab: TabType): ContextListItem[] => {
    return catalog.map((item) => ({
      ...item,
      entityTab: tab,
      entityTypeLabel: ENTITY_TYPE_LABELS[tab],
    }))
  }, [])

  const getItemsForTab = useCallback((tab: TabType): ContextListItem[] => {
    if (tab === 'characters') {
      return mergeListWithSelectedNames(
        characters,
        [...(selections.characters_full ?? []), ...(selections.characters_excerpt ?? [])],
        (n) => resolveCharacterCanonicalName(n, characters),
      )
    }
    if (tab === 'locations') {
      return mergeListWithSelectedNames(
        locations,
        [...(selections.locations_full ?? []), ...(selections.locations_excerpt ?? [])],
        (n) => resolveLocationCanonicalName(n, locations),
      )
    }
    if (tab === 'items') {
      return mergeListWithSelectedNames(
        items,
        [...(selections.items_full ?? []), ...(selections.items_excerpt ?? [])],
        (n) => resolveGddCanonicalName(n, items),
      )
    }
    if (tab === 'species') {
      return mergeListWithSelectedNames(
        species,
        [...(selections.species_full ?? []), ...(selections.species_excerpt ?? [])],
        (n) => resolveGddCanonicalName(n, species),
      )
    }
    if (tab === 'communities') {
      return mergeListWithSelectedNames(
        communities,
        [...(selections.communities_full ?? []), ...(selections.communities_excerpt ?? [])],
        (n) => resolveGddCanonicalName(n, communities),
      )
    }
    return []
  }, [characters, locations, items, species, communities, selections])

  const isSearching = searchQuery.trim().length > 0

  const displayItems = useMemo(() => {
    if (!isSearching) {
      return tagCatalogItems(getItemsForTab(activeTab), activeTab)
    }
    return (Object.keys(ENTITY_TYPE_LABELS) as TabType[]).flatMap((tab) =>
      tagCatalogItems(getItemsForTab(tab), tab),
    )
  }, [isSearching, activeTab, getItemsForTab, tagCatalogItems])

  const hasMoreForActiveTab = (() => {
    if (activeTab === 'characters') return charactersPage < charactersTotalPages
    if (activeTab === 'locations') return locationsPage < locationsTotalPages
    if (activeTab === 'items') return itemsPage < itemsTotalPages
    if (activeTab === 'communities') return communitiesPage < communitiesTotalPages
    return false
  })()

  const hasMoreAny =
    charactersPage < charactersTotalPages ||
    locationsPage < locationsTotalPages ||
    itemsPage < itemsTotalPages ||
    communitiesPage < communitiesTotalPages

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

  const handleModeChange = (
    name: string,
    mode: 'full' | 'excerpt',
    entityTab?: ContextEntityTab,
  ) => {
    const tab = (entityTab ?? activeTab) as TabType
    if (tab === 'characters') {
      setElementMode('characters', name, mode)
    } else if (tab === 'locations') {
      setElementMode('locations', name, mode)
    } else if (tab === 'items') {
      setElementMode('items', name, mode)
    } else if (tab === 'species') {
      setElementMode('species', name, mode)
    } else if (tab === 'communities') {
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

  const isNarrativeSelected = (category: NarrativeCategory, name: string): boolean => {
    return (selections[category] ?? []).includes(name)
  }

  const narrativeGroups = narrativeContexts.reduce<Record<NarrativeCategory, NarrativeContextResponse[]>>(
    (acc, item) => {
      acc[item.category].push(item)
      return acc
    },
    { narrative_structures: [], chapters: [], scenes: [] },
  )

  const getElementModeForList = (name: string, entityTab?: ContextEntityTab): 'full' | 'excerpt' | null => {
    const tab = (entityTab ?? activeTab) as TabType
    if (tab === 'characters') return getElementMode('characters', name)
    if (tab === 'locations') return getElementMode('locations', name)
    if (tab === 'items') return getElementMode('items', name)
    if (tab === 'species') return getElementMode('species', name)
    if (tab === 'communities') return getElementMode('communities', name)
    return null
  }

  const resolveIsItemSelected = useCallback(
    (name: string, entityTab?: ContextEntityTab): boolean => {
      const tab = (entityTab ?? activeTab) as TabType
      const storeKey = STORE_TYPE_MAP[tab]
      return storeKey ? isElementSelected(storeKey, name) : false
    },
    [activeTab, isElementSelected],
  )

  const tabItemCounts: Record<TabType, number> = {
    characters: characters.length,
    locations: locations.length,
    items: items.length,
    species: species.length,
    communities: communities.length,
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
      <ContextSearchControls
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        sortType={sortType}
        onSortTypeChange={setSortType}
        inputRef={searchInputRef}
      />

      {/* Barre d'onglets compacte : 5 onglets + ⚙ sur une ligne (repli caption si débordement) */}
      <div
        ref={tabBarRef}
        data-context-gdd-tab-density={tabBarDensity}
        style={{
          flexShrink: 0,
          display: 'flex',
          flexWrap: 'nowrap',
          alignItems: 'stretch',
          gap: tabChromeTier.barGap,
          padding: tabChromeTier.barPadding,
          borderBottom: `1px solid ${theme.border.primary}`,
          position: 'relative',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        {TAB_DEFS.map(({ key, label }) => {
          const isActive = activeTab === key
          const showCount = isActive || hoveredTab === key
          const count = tabItemCounts[key]
          return (
            <button
              key={key}
              type="button"
              className="context-gdd-tab"
              onClick={() => {
                setActiveTab(key)
                setSelectedDetail(null)
                onItemSelected?.(null, null)
              }}
              onMouseEnter={() => setHoveredTab(key)}
              onMouseLeave={() => setHoveredTab(null)}
              style={contextGddTabButtonStyle(
                isActive,
                tabChromeTier,
                tabChromeTier.tabFontKey,
              )}
            >
              {label}
              {showCount && (
                <span
                  aria-hidden="true"
                  style={{
                    marginLeft: '0.4em',
                    fontFamily: redesignFont.mono,
                    fontSize: '0.85em',
                    color: isActive ? theme.text.secondary : theme.text.tertiary,
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}

        <button
          type="button"
          className="context-gdd-tab"
          data-testid="btn-toggle-rules"
          aria-label="Règles de sélection"
          aria-pressed={showRulesEditor}
          onClick={() => setShowRulesEditor((v) => !v)}
          title="Règles de sélection de contexte"
          style={{
            flexShrink: 0,
            minHeight: tabChromeTier.tabMinHeightPx,
            padding: tabChromeTier.gearPadding,
            border: 'none',
            borderRadius: tabChromeTier.borderRadiusPx,
            borderBottom: showRulesEditor
              ? `2px solid ${theme.button.primary.background}`
              : '2px solid transparent',
            backgroundColor: showRulesEditor ? theme.background.tertiary : 'transparent',
            color: theme.text.primary,
            cursor: 'pointer',
            fontSize: remSize('section'),
            lineHeight: 1.2,
            boxSizing: 'border-box',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
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
          fontSize: remSize('body') 
        }}>
          {error}
        </div>
      )}

      <div style={{ flex: '1 1 0', overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
        <ContextList
          items={displayItems}
          selectedItems={getSelectedItems()}
          onItemClick={handleItemClick}
          onItemToggle={handleItemToggle}
          selectedDetail={selectedDetail}
          onSelectDetail={setSelectedDetail}
          isLoading={isLoading}
          getElementMode={getElementModeForList}
          onModeChange={handleModeChange}
          isItemSelected={resolveIsItemSelected}
          tabId={isSearching ? 'search-all' : activeTab}
          showCheckboxes
          priorityEntityTab={activeTab}
          showSearchBar={false}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          sortType={sortType}
          onSortTypeChange={setSortType}
          onScrollToBottom={isSearching ? loadMoreForSearch : loadMore}
          loadingMore={loadingMore}
          hasMore={isSearching ? hasMoreAny : hasMoreForActiveTab}
        />
      </div>

      <ContextPanelAccordionGroup>
        <ContextSuggestionsPanel />

        <ContextPanelAccordionSection
          testId="narrative-context-selector"
          title="Ajouter contexte narratif"
        >
          <div style={{ display: 'grid', gap: '0.4rem' }}>
            {([
              ['narrative_structures', 'Structure narrative'],
              ['chapters', 'Chapitres'],
              ['scenes', 'Scènes'],
            ] as const).map(([category, label]) => (
              <div key={category}>
                <div style={{ color: theme.text.secondary, fontSize: '0.75rem', marginBottom: '0.2rem' }}>
                  {label}
                </div>
                <div style={{ display: 'grid', gap: '0.2rem', maxHeight: '7rem', overflowY: 'auto' }}>
                  {narrativeGroups[category].map((item) => (
                    <label
                      key={`${category}:${item.name}`}
                      style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', color: theme.text.primary, fontSize: '0.78rem' }}
                    >
                      <input
                        type="checkbox"
                        checked={isNarrativeSelected(category, item.name)}
                        onChange={() => toggleNarrativeContext(category, item.name)}
                      />
                      <span>{item.name}</span>
                    </label>
                  ))}
                  {narrativeGroups[category].length === 0 && (
                    <span style={{ color: theme.text.tertiary, fontSize: '0.75rem' }}>Aucune source disponible.</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ContextPanelAccordionSection>

        <SelectedContextSummary 
          selections={selections} 
          onClear={clearSelections}
          onRemoveEntity={handleRemoveEntity}
          onModeChange={handleSelectionPanelModeChange}
          onError={(err) => setError(err)}
          onSuccess={() => setError(null)}
        />

        <ContextPanelAccordionSection
          testId="context-llm-diagnostics"
          title="Diagnostic LLM — pertinence et sections GDD"
          bodyStyle={{ padding: 0 }}
        >
          <ContextRelevancePanel embedded />
          <ContextUsagePanel />
        </ContextPanelAccordionSection>
      </ContextPanelAccordionGroup>
    </div>
  )
}

