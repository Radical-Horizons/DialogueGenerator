/**
 * Composant principal de sélection de contexte avec onglets pour personnages, lieux et objets.
 */
import { useState, useEffect, useCallback } from 'react'
import * as contextAPI from '../../api/context'
import type { 
  CharacterResponse, 
  LocationResponse, 
  ItemResponse,
  SpeciesResponse,
  CommunityResponse,
} from '../../types/api'
import { ContextList } from './ContextList'
import { SelectedContextSummary } from './SelectedContextSummary'
import { useContextStore } from '../../store/contextStore'
import { getErrorMessage } from '../../types/errors'
import { theme } from '../../theme'

type TabType = 'characters' | 'locations' | 'items' | 'species' | 'communities'

type ContextItem = CharacterResponse | LocationResponse | ItemResponse | SpeciesResponse | CommunityResponse

interface ContextSelectorProps {
  onItemSelected?: (item: ContextItem | null) => void
}

export function ContextSelector({ onItemSelected }: ContextSelectorProps = {}) {
  const [activeTab, setActiveTab] = useState<TabType>('characters')
  const [characters, setCharacters] = useState<CharacterResponse[]>([])
  const [locations, setLocations] = useState<LocationResponse[]>([])
  const [items, setItems] = useState<ItemResponse[]>([])
  const [species, setSpecies] = useState<SpeciesResponse[]>([])
  const [communities, setCommunities] = useState<CommunityResponse[]>([])
  const [selectedDetail, setSelectedDetail] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
  } = useContextStore()

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [charsRes, locsRes, itemsRes, speciesRes, communitiesRes] = await Promise.all([
        contextAPI.listCharacters(),
        contextAPI.listLocations(),
        contextAPI.listItems(),
        contextAPI.listSpecies(),
        contextAPI.listCommunities(),
      ])
      setCharacters(charsRes.characters)
      setLocations(locsRes.locations)
      setItems(itemsRes.items)
      setSpecies(speciesRes.species)
      setCommunities(communitiesRes.communities)
      
      // Mettre à jour le store avec les listes pour qu'elles soient accessibles partout
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

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleItemClick = async (name: string) => {
    try {
      let item: CharacterResponse | LocationResponse | ItemResponse | SpeciesResponse | CommunityResponse | null = null
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

      if (item && selectedDetail === name) {
        setSelectedDetail(null)
        onItemSelected?.(null)
      } else if (item) {
        setSelectedDetail(name)
        onItemSelected?.(item)
      }
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const handleItemToggle = (name: string) => {
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
  }

  const getCurrentItems = (): (CharacterResponse | LocationResponse | ItemResponse | SpeciesResponse | CommunityResponse)[] => {
    if (activeTab === 'characters') return characters
    if (activeTab === 'locations') return locations
    if (activeTab === 'items') return items
    if (activeTab === 'species') return species
    if (activeTab === 'communities') return communities
    return []
  }

  const getSelectedCount = (): number => {
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
    // Fusionner les listes full et excerpt pour chaque type
    // Sécurité: s'assurer que les propriétés sont toujours des tableaux
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

  const getElementModeForList = (name: string): 'full' | 'excerpt' | null => {
    if (activeTab === 'characters') {
      return getElementMode('characters', name)
    } else if (activeTab === 'locations') {
      return getElementMode('locations', name)
    } else if (activeTab === 'items') {
      return getElementMode('items', name)
    } else if (activeTab === 'species') {
      return getElementMode('species', name)
    } else if (activeTab === 'communities') {
      return getElementMode('communities', name)
    }
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
        />
      </div>
      <div style={{ flex: '0 0 auto' }}>
        <SelectedContextSummary 
          selections={selections} 
          onClear={clearSelections}
          onError={(err) => setError(err)}
          onSuccess={() => setError(null)}
        />
      </div>
    </div>
  )
}

