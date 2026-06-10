/**
 * Palette de commandes avec recherche globale (Ctrl+K ou /).
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { theme } from '../../theme'
import { remSize } from '../../theme/uiTypography'
import { filterCommandPaletteItems, type CommandPaletteItem } from '../../hooks/useCommandPalette'
import * as contextAPI from '../../api/context'
import * as unityDialoguesAPI from '../../api/unityDialogues'
import { useContextStore } from '../../store/contextStore'
import { useGenerationActionsStore } from '../../store/generationActionsStore'

export interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  /** Espace au-dessus du clavier logiciel (visual viewport), story 17.4 */
  keyboardBottomInsetPx?: number
}

const CATEGORY_LABELS: Record<CommandPaletteItem['category'], string> = {
  action: 'Actions',
  character: 'Personnages',
  location: 'Lieux',
  item: 'Objets',
  dialogue: 'Dialogues Unity',
  navigation: 'Navigation',
}

export function CommandPalette({ isOpen, onClose, keyboardBottomInsetPx = 0 }: CommandPaletteProps) {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [items, setItems] = useState<CommandPaletteItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const { selections, toggleCharacter, toggleLocation, toggleItem } = useContextStore()
  const { actions } = useGenerationActionsStore()

  // Charger les données au montage ou quand la palette s'ouvre
  useEffect(() => {
    if (!isOpen) return

    const loadData = async () => {
      setIsLoading(true)
      try {
        const [charactersRes, locationsRes, itemsRes, dialoguesRes] = await Promise.all([
          contextAPI.listCharacters().catch(() => ({ characters: [] })),
          contextAPI.listLocations().catch(() => ({ locations: [] })),
          contextAPI.listItems().catch(() => ({ items: [] })),
          unityDialoguesAPI.listUnityDialogues().catch(() => ({ dialogues: [] })),
        ])

        const newItems: CommandPaletteItem[] = []

        // Actions
        if (actions.handleGenerate) {
          newItems.push({
            id: 'action:generate',
            label: 'Générer un dialogue',
            description: 'Générer un nouveau dialogue Unity',
            category: 'action',
            action: () => {
              actions.handleGenerate?.()
              onClose()
            },
            keywords: ['générer', 'generate', 'create'],
          })
        }

        // Navigation
        newItems.push(
          {
            id: 'nav:dashboard',
            label: 'Aller au Dashboard',
            description: 'Naviguer vers la page principale',
            category: 'navigation',
            action: () => {
              navigate('/')
              onClose()
            },
            keywords: ['dashboard', 'accueil', 'home'],
          },
          {
            id: 'nav:unity',
            label: 'Aller aux Dialogues Unity',
            description: 'Naviguer vers les dialogues Unity',
            category: 'navigation',
            action: () => {
              navigate('/unity-dialogues')
              onClose()
            },
            keywords: ['unity', 'dialogues'],
          },
          {
            id: 'nav:usage',
            label: 'Aller aux Statistiques',
            description: 'Naviguer vers les statistiques d\'usage',
            category: 'navigation',
            action: () => {
              navigate('/usage')
              onClose()
            },
            keywords: ['usage', 'stats', 'statistiques'],
          }
        )

        // Personnages
        const allSelectedCharacters = [
          ...(Array.isArray(selections.characters_full) ? selections.characters_full : []),
          ...(Array.isArray(selections.characters_excerpt) ? selections.characters_excerpt : [])
        ]
        charactersRes.characters.forEach((char) => {
          const isSelected = allSelectedCharacters.includes(char.name)
          newItems.push({
            id: `character:${char.name}`,
            label: `${isSelected ? '✓ ' : ''}${char.name}`,
            description: isSelected ? 'Personnage sélectionné (cliquer pour désélectionner)' : 'Personnage (cliquer pour sélectionner)',
            category: 'character',
            action: () => {
              toggleCharacter(char.name)
              onClose()
            },
            keywords: [char.name],
          })
        })

        // Lieux
        const allSelectedLocations = [
          ...(Array.isArray(selections.locations_full) ? selections.locations_full : []),
          ...(Array.isArray(selections.locations_excerpt) ? selections.locations_excerpt : [])
        ]
        locationsRes.locations.forEach((loc) => {
          const isSelected = allSelectedLocations.includes(loc.name)
          newItems.push({
            id: `location:${loc.name}`,
            label: `${isSelected ? '✓ ' : ''}${loc.name}`,
            description: isSelected ? 'Lieu sélectionné (cliquer pour désélectionner)' : 'Lieu (cliquer pour sélectionner)',
            category: 'location',
            action: () => {
              toggleLocation(loc.name)
              onClose()
            },
            keywords: [loc.name],
          })
        })

        // Objets
        const allSelectedItems = [
          ...(Array.isArray(selections.items_full) ? selections.items_full : []),
          ...(Array.isArray(selections.items_excerpt) ? selections.items_excerpt : [])
        ]
        itemsRes.items.forEach((item) => {
          const isSelected = allSelectedItems.includes(item.name)
          newItems.push({
            id: `item:${item.name}`,
            label: `${isSelected ? '✓ ' : ''}${item.name}`,
            description: isSelected ? 'Objet sélectionné (cliquer pour désélectionner)' : 'Objet (cliquer pour sélectionner)',
            category: 'item',
            action: () => {
              toggleItem(item.name)
              onClose()
            },
            keywords: [item.name],
          })
        })

        // Dialogues Unity
        dialoguesRes.dialogues.forEach((dialogue) => {
          newItems.push({
            id: `dialogue:${dialogue.filename}`,
            label: dialogue.title || dialogue.filename,
            description: `Ouvrir le dialogue Unity: ${dialogue.filename}`,
            category: 'dialogue',
            action: () => {
              navigate('/unity-dialogues')
              onClose()
            },
            keywords: [dialogue.filename, dialogue.title || ''],
          })
        })

        setItems(newItems)
      } catch (err) {
        console.error('Erreur lors du chargement des données de la commande palette:', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [isOpen, navigate, onClose, selections, toggleCharacter, toggleLocation, toggleItem, actions])

  // Filtrer les items
  const filteredItems = useMemo(() => {
    return filterCommandPaletteItems(items, searchQuery)
  }, [items, searchQuery])

  // Grouper par catégorie
  const groupedItems = useMemo(() => {
    const groups: Record<string, CommandPaletteItem[]> = {}
    filteredItems.forEach((item) => {
      if (!groups[item.category]) {
        groups[item.category] = []
      }
      groups[item.category].push(item)
    })
    return groups
  }, [filteredItems])

  // Focus sur l'input quand la palette s'ouvre
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
      setSearchQuery('')
      setHighlightedIndex(0)
    }
  }, [isOpen])

  // Navigation au clavier
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightedIndex((prev) => Math.min(prev + 1, filteredItems.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightedIndex((prev) => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filteredItems[highlightedIndex]) {
          filteredItems[highlightedIndex].action()
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [filteredItems, highlightedIndex, onClose]
  )

  // Scroll vers l'élément surligné
  useEffect(() => {
    if (listRef.current && filteredItems.length > 0) {
      const itemElement = listRef.current.querySelector(`[data-item-index="${highlightedIndex}"]`)
      if (itemElement) {
        itemElement.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
      }
    }
  }, [highlightedIndex, filteredItems.length])

  if (!isOpen) return null

  return (
    <div
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
        paddingTop: '20vh',
        zIndex: 10000,
      }}
      onClick={onClose}
    >
      <div
        data-shell-keyboard-zone="true"
        style={{
          backgroundColor: theme.background.panel,
          borderRadius: '8px',
          padding: '1rem',
          paddingBottom: `calc(1rem + ${keyboardBottomInsetPx}px)`,
          width: '90%',
          maxWidth: '600px',
          maxHeight: '60vh',
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Champ de recherche */}
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value)
            setHighlightedIndex(0)
          }}
          onKeyDown={handleKeyDown}
          placeholder="Rechercher des actions, personnages, lieux, dialogues..."
          style={{
            width: '100%',
            padding: '0.75rem',
            fontSize: remSize('section'),
            backgroundColor: theme.input.background,
            color: theme.text.primary,
            border: `1px solid ${theme.border.primary}`,
            borderRadius: '4px',
            marginBottom: '1rem',
          }}
        />

        {/* Liste des résultats */}
        <div
          ref={listRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            maxHeight: '50vh',
          }}
        >
          {isLoading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: theme.text.secondary }}>
              Chargement...
            </div>
          ) : filteredItems.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: theme.text.secondary }}>
              Aucun résultat trouvé
            </div>
          ) : (
            Object.entries(groupedItems).map(([category, categoryItems]) => (
              <div key={category} style={{ marginBottom: '1rem' }}>
                <div
                  style={{
                    fontSize: remSize('small'),
                    fontWeight: 'bold',
                    color: theme.text.secondary,
                    textTransform: 'uppercase',
                    padding: '0.5rem 0.75rem',
                    backgroundColor: theme.background.secondary,
                  }}
                >
                  {CATEGORY_LABELS[category as CommandPaletteItem['category']]}
                </div>
                {categoryItems.map((item) => {
                  const globalIndex = filteredItems.indexOf(item)
                  const isHighlighted = globalIndex === highlightedIndex
                  return (
                    <div
                      key={item.id}
                      data-item-index={globalIndex}
                      onClick={() => item.action()}
                      onMouseEnter={() => setHighlightedIndex(globalIndex)}
                      style={{
                        padding: '0.75rem 1rem',
                        cursor: 'pointer',
                        backgroundColor: isHighlighted ? theme.border.focus : 'transparent',
                        color: theme.text.primary,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.25rem',
                      }}
                    >
                      <div style={{ fontWeight: isHighlighted ? 'bold' : 'normal' }}>{item.label}</div>
                      {item.description && (
                        <div style={{ fontSize: remSize('accent'), color: theme.text.secondary }}>{item.description}</div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* Aide */}
        <div
          style={{
            marginTop: '0.5rem',
            paddingTop: '0.5rem',
            borderTop: `1px solid ${theme.border.primary}`,
            fontSize: remSize('small'),
            color: theme.text.secondary,
            display: 'flex',
            gap: '1rem',
            justifyContent: 'center',
          }}
        >
          <span>
            <kbd style={{ padding: '0.125rem 0.25rem', backgroundColor: theme.input.background, borderRadius: '2px' }}>↑↓</kbd> Naviguer
          </span>
          <span>
            <kbd style={{ padding: '0.125rem 0.25rem', backgroundColor: theme.input.background, borderRadius: '2px' }}>Enter</kbd> Sélectionner
          </span>
          <span>
            <kbd style={{ padding: '0.125rem 0.25rem', backgroundColor: theme.input.background, borderRadius: '2px' }}>Esc</kbd> Fermer
          </span>
        </div>
      </div>
    </div>
  )
}

