/**
 * Composant principal de sélection de contexte (panneau Contexte GDD) avec onglets par type d'entité.
 * AC FR11 : Personnages, Lieux (contexte), Objets, Espèces, Communautés.
 */
import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
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
import type { ContextListItem } from './ContextList'
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
  const [characters, setCharacters] = useState<CharacterResponse[]>([])
  const [locations, setLocations] = useState<LocationResponse[]>([])
  const [items, setItems] = useState<ItemResponse[]>([])
  const [species, setSpecies] = useState<SpeciesResponse[]>([])
  const [communities, setCommunities] = useState<CommunityResponse[]>([])
  const [narrativeContexts, setNarrativeContexts] = useState<NarrativeContextResponse[]>([])
  const [selectedDetail, setSelectedDetail] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const tabBarRef = useRef<HTMLDivElement>(null)
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
      return mergeListWithSelectedNames(
        characters,
        [...(selections.characters_full ?? []), ...(selections.characters_excerpt ?? [])],
        (n) => resolveCharacterCanonicalName(n, characters),
      )
    }
    if (activeTab === 'locations') {
      return mergeListWithSelectedNames(
        locations,
        [...(selections.locations_full ?? []), ...(selections.locations_excerpt ?? [])],
        (n) => resolveLocationCanonicalName(n, locations),
      )
    }
    if (activeTab === 'items') {
      return mergeListWithSelectedNames(
        items,
        [...(selections.items_full ?? []), ...(selections.items_excerpt ?? [])],
        (n) => resolveGddCanonicalName(n, items),
      )
    }
    if (activeTab === 'species') {
      return mergeListWithSelectedNames(
        species,
        [...(selections.species_full ?? []), ...(selections.species_excerpt ?? [])],
        (n) => resolveGddCanonicalName(n, species),
      )
    }
    if (activeTab === 'communities') {
      return mergeListWithSelectedNames(
        communities,
        [...(selections.communities_full ?? []), ...(selections.communities_excerpt ?? [])],
        (n) => resolveGddCanonicalName(n, communities),
      )
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
        {TAB_DEFS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className="context-gdd-tab"
            onClick={() => {
              setActiveTab(key)
              setSelectedDetail(null)
              onItemSelected?.(null, null)
            }}
            style={contextGddTabButtonStyle(
              activeTab === key,
              tabChromeTier,
              tabChromeTier.tabFontKey,
            )}
          >
            {label}
          </button>
        ))}

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

      <ContextSuggestionsPanel />

      <details
        data-testid="narrative-context-selector"
        style={{
          flexShrink: 0,
          backgroundColor: theme.background.secondary,
        }}
      >
        <summary
          style={{
            padding: '0.45rem 0.75rem',
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontWeight: 600,
            color: theme.text.primary,
          }}
        >
          Ajouter contexte narratif
        </summary>
        <div style={{ padding: '0.5rem 0.75rem', display: 'grid', gap: '0.4rem' }}>
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
      </details>

      <SelectedContextSummary 
        selections={selections} 
        onClear={clearSelections}
        onRemoveEntity={handleRemoveEntity}
        onModeChange={handleSelectionPanelModeChange}
        onError={(err) => setError(err)}
        onSuccess={() => setError(null)}
      />

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
            fontSize: remSize('small'),
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

