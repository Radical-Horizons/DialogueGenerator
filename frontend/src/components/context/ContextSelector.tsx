/**
 * Composant principal de sélection de contexte (panneau Contexte GDD) avec onglets par type d'entité.
 * AC FR11 : Personnages, Lieux, Régions, Objets, Espèces, Communautés. (Thèmes reporté : pas d'API backend.)
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
import { SelectedContextSummary } from './SelectedContextSummary'
import type { EntityType } from './SelectedContextSummary'
import { ContextSuggestionsPanel } from './ContextSuggestionsPanel'
import { useContextStore } from '../../store/contextStore'
import { getErrorMessage } from '../../types/errors'
import { theme } from '../../theme'

type TabType = 'characters' | 'locations' | 'regions' | 'items' | 'species' | 'communities'

type ContextItem = CharacterResponse | LocationResponse | ItemResponse | SpeciesResponse | CommunityResponse

const PAGE_SIZE = 50

const ENTITY_TYPE_LABELS: Record<TabType, string> = {
  characters: 'Personnage',
  locations: 'Lieu',
  regions: 'Région',
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

interface ContextSelectorProps {
  onItemSelected?: (item: ContextItem | null) => void
}

export function ContextSelector({ onItemSelected }: ContextSelectorProps = {}) {
  const [activeTab, setActiveTab] = useState<TabType>('characters')
  const [characters, setCharacters] = useState<CharacterResponse[]>([])
  const [locations, setLocations] = useState<LocationResponse[]>([])
  const [regions, setRegions] = useState<ContextListItem[]>([])
  const [items, setItems] = useState<ItemResponse[]>([])
  const [species, setSpecies] = useState<SpeciesResponse[]>([])
  const [communities, setCommunities] = useState<CommunityResponse[]>([])
  const [selectedDetail, setSelectedDetail] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
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
  } = useContextStore()

  // Ref toujours à jour pour éviter les closures périmées dans fetchAndSetSuggestions.
  const selectionsRef = useRef(selections)
  selectionsRef.current = selections

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [charsRes, locsRes, regionsRes, itemsRes, speciesRes, communitiesRes] = await Promise.all([
        contextAPI.listCharacters({ page: 1, page_size: PAGE_SIZE }),
        contextAPI.listLocations({ page: 1, page_size: PAGE_SIZE }),
        contextAPI.listRegions(),
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
      setRegions(regionsRes.regions.map((name) => ({ name })))
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
    if (activeTab === 'regions' || activeTab === 'species') return

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
  }, [loadData])

  const handleItemClick = async (name: string) => {
    try {
      let item: ContextItem | { name: string; data: Record<string, unknown> } | null = null
      if (activeTab === 'characters') {
        item = await contextAPI.getCharacter(name)
      } else if (activeTab === 'locations') {
        item = await contextAPI.getLocation(name)
      } else if (activeTab === 'regions') {
        const loc = await contextAPI.getLocation(name)
        item = loc
      } else if (activeTab === 'items') {
        item = await contextAPI.getItem(name)
      } else if (activeTab === 'species') {
        item = await contextAPI.getSpecies(name)
      } else if (activeTab === 'communities') {
        item = await contextAPI.getCommunity(name)
      }

      if (item && selectedDetail === name) {
        setSelectedDetail(null)
        onItemSelected?.(item as ContextItem)
      } else if (item) {
        setSelectedDetail(name)
        onItemSelected?.(item as ContextItem)
      }
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const fetchAndSetSuggestions = useCallback(async (triggerType: string, triggerName: string) => {
    try {
      const response = await contextAPI.getSuggestions({
        trigger_type: triggerType,
        trigger_name: triggerName,
        already_selected: selectionsRef.current,
      })
      setSuggestions(response.suggestions)
    } catch {
      // Suggestions sont non-critiques — échec silencieux
    }
  }, [setSuggestions])

  const handleItemToggle = (name: string) => {
    if (activeTab === 'regions') return

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
      onItemSelected?.(null)
    }

    if (!wasSelected) {
      const triggerType = TRIGGER_TYPE_MAP[activeTab]
      if (triggerType) {
        void fetchAndSetSuggestions(triggerType, name)
      }
    } else {
      setSuggestions([])
    }
  }

  const getCurrentItems = (): ContextListItem[] => {
    if (activeTab === 'characters') return characters
    if (activeTab === 'locations') return locations
    if (activeTab === 'regions') return regions
    if (activeTab === 'items') return items
    if (activeTab === 'species') return species
    if (activeTab === 'communities') return communities
    return []
  }

  const getSelectedCount = (): number => {
    if (activeTab === 'regions') return 0
    if (activeTab === 'characters') {
      return (Array.isArray(selections.characters_full) ? selections.characters_full.length : 0) +
        (Array.isArray(selections.characters_excerpt) ? selections.characters_excerpt.length : 0)
    }
    if (activeTab === 'locations') {
      return (Array.isArray(selections.locations_full) ? selections.locations_full.length : 0) +
        (Array.isArray(selections.locations_excerpt) ? selections.locations_excerpt.length : 0)
    }
    if (activeTab === 'items') {
      return (Array.isArray(selections.items_full) ? selections.items_full.length : 0) +
        (Array.isArray(selections.items_excerpt) ? selections.items_excerpt.length : 0)
    }
    if (activeTab === 'species') {
      return (Array.isArray(selections.species_full) ? selections.species_full.length : 0) +
        (Array.isArray(selections.species_excerpt) ? selections.species_excerpt.length : 0)
    }
    if (activeTab === 'communities') {
      return (Array.isArray(selections.communities_full) ? selections.communities_full.length : 0) +
        (Array.isArray(selections.communities_excerpt) ? selections.communities_excerpt.length : 0)
    }
    return 0
  }

  const getSelectedItems = (): string[] => {
    if (activeTab === 'regions') return []
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
    if (activeTab === 'regions') return null
    if (activeTab === 'characters') return getElementMode('characters', name)
    if (activeTab === 'locations') return getElementMode('locations', name)
    if (activeTab === 'items') return getElementMode('items', name)
    if (activeTab === 'species') return getElementMode('species', name)
    if (activeTab === 'communities') return getElementMode('communities', name)
    return null
  }

  const showCheckboxes = activeTab !== 'regions'

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
      <div style={{ flexShrink: 0, display: 'flex', borderBottom: `1px solid ${theme.border.primary}` }}>
        <button
          onClick={() => {
            setActiveTab('characters')
            setSelectedDetail(null)
            onItemSelected?.(null)
          }}
          style={{
            flex: 1,
            padding: '0.75rem',
            border: 'none',
            borderBottom: activeTab === 'characters' ? `2px solid ${theme.button.primary.background}` : 'none',
            backgroundColor: activeTab === 'characters' ? theme.background.tertiary : 'transparent',
            color: theme.text.primary,
            cursor: 'pointer',
            fontWeight: activeTab === 'characters' ? 'bold' : 'normal',
          }}
        >
          Personnages {activeTab === 'characters' && getSelectedCount() > 0 ? `(${getSelectedCount()}/${characters.length})` : `(${characters.length})`}
        </button>
        <button
          onClick={() => {
            setActiveTab('locations')
            setSelectedDetail(null)
            onItemSelected?.(null)
          }}
          style={{
            flex: 1,
            padding: '0.75rem',
            border: 'none',
            borderBottom: activeTab === 'locations' ? `2px solid ${theme.button.primary.background}` : 'none',
            backgroundColor: activeTab === 'locations' ? theme.background.tertiary : 'transparent',
            color: theme.text.primary,
            cursor: 'pointer',
            fontWeight: activeTab === 'locations' ? 'bold' : 'normal',
          }}
        >
          Lieux {activeTab === 'locations' && getSelectedCount() > 0 ? `(${getSelectedCount()}/${locations.length})` : `(${locations.length})`}
        </button>
        <button
          onClick={() => {
            setActiveTab('regions')
            setSelectedDetail(null)
            onItemSelected?.(null)
          }}
          style={{
            flex: 1,
            padding: '0.75rem',
            border: 'none',
            borderBottom: activeTab === 'regions' ? `2px solid ${theme.button.primary.background}` : 'none',
            backgroundColor: activeTab === 'regions' ? theme.background.tertiary : 'transparent',
            color: theme.text.primary,
            cursor: 'pointer',
            fontWeight: activeTab === 'regions' ? 'bold' : 'normal',
          }}
        >
          Régions ({regions.length})
        </button>
        <button
          onClick={() => {
            setActiveTab('items')
            setSelectedDetail(null)
            onItemSelected?.(null)
          }}
          style={{
            flex: 1,
            padding: '0.75rem',
            border: 'none',
            borderBottom: activeTab === 'items' ? `2px solid ${theme.button.primary.background}` : 'none',
            backgroundColor: activeTab === 'items' ? theme.background.tertiary : 'transparent',
            color: theme.text.primary,
            cursor: 'pointer',
            fontWeight: activeTab === 'items' ? 'bold' : 'normal',
          }}
        >
          Objets {activeTab === 'items' && getSelectedCount() > 0 ? `(${getSelectedCount()}/${items.length})` : `(${items.length})`}
        </button>
        <button
          onClick={() => {
            setActiveTab('species')
            setSelectedDetail(null)
            onItemSelected?.(null)
          }}
          style={{
            flex: 1,
            padding: '0.75rem',
            border: 'none',
            borderBottom: activeTab === 'species' ? `2px solid ${theme.button.primary.background}` : 'none',
            backgroundColor: activeTab === 'species' ? theme.background.tertiary : 'transparent',
            color: theme.text.primary,
            cursor: 'pointer',
            fontWeight: activeTab === 'species' ? 'bold' : 'normal',
          }}
        >
          Espèces {activeTab === 'species' && getSelectedCount() > 0 ? `(${getSelectedCount()}/${species.length})` : `(${species.length})`}
        </button>
        <button
          onClick={() => {
            setActiveTab('communities')
            setSelectedDetail(null)
            onItemSelected?.(null)
          }}
          style={{
            flex: 1,
            padding: '0.75rem',
            border: 'none',
            borderBottom: activeTab === 'communities' ? `2px solid ${theme.button.primary.background}` : 'none',
            backgroundColor: activeTab === 'communities' ? theme.background.tertiary : 'transparent',
            color: theme.text.primary,
            cursor: 'pointer',
            fontWeight: activeTab === 'communities' ? 'bold' : 'normal',
          }}
        >
          Communautés {activeTab === 'communities' && getSelectedCount() > 0 ? `(${getSelectedCount()}/${communities.length})` : `(${communities.length})`}
        </button>
      </div>

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
          showCheckboxes={showCheckboxes}
          entityTypeLabel={ENTITY_TYPE_LABELS[activeTab]}
          onScrollToBottom={loadMore}
          loadingMore={loadingMore}
        />
      </div>
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
    </div>
  )
}

