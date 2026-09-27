/**
 * Palette de commandes avec recherche globale (Ctrl+K ou /).
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { theme } from '../../theme'
import { remSize } from '../../theme/uiTypography'
import {
  redesignControl,
  redesignFont,
  redesignHairline,
  redesignMonoLabelStyle,
  redesignRadius,
  redesignSpacing,
  redesignText,
} from '../../theme/redesignTokens'
import { listItemSelectionStyle } from '../../theme/selectionTokens'
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

  const kbdStyle: React.CSSProperties = {
    fontFamily: redesignFont.mono,
    fontSize: '10.5px',
    color: redesignText.muted,
    padding: '1px 5px',
    border: `1px solid ${redesignHairline.strong}`,
    borderRadius: '3px',
    backgroundColor: 'transparent',
  }

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
          backgroundColor: theme.background.elevated,
          border: `1px solid ${redesignHairline.strong}`,
          borderRadius: `${redesignRadius.frame}px`,
          padding: `${redesignSpacing.md}px`,
          // `1rem` conservé : `CommandPalette.keyboard.test.tsx` (17.4) vérifie cette expression.
          paddingBottom: `calc(1rem + ${keyboardBottomInsetPx}px)`,
          width: '90%',
          maxWidth: '600px',
          maxHeight: '60vh',
          overflow: 'hidden',
          boxShadow: theme.shadow.card,
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
            boxSizing: 'border-box',
            padding: `${redesignSpacing.sm}px ${redesignSpacing.md}px`,
            fontSize: remSize('section'),
            backgroundColor: theme.input.background,
            color: redesignText.strong,
            border: `1px solid ${redesignControl.inputBorder}`,
            borderRadius: `${redesignRadius.control}px`,
            marginBottom: `${redesignSpacing.sm}px`,
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
            <div style={{ padding: `${redesignSpacing.xl}px ${redesignSpacing.md}px`, textAlign: 'center', fontSize: '13px', color: redesignText.secondary }}>
              Chargement...
            </div>
          ) : filteredItems.length === 0 ? (
            <div style={{ padding: `${redesignSpacing.xl}px ${redesignSpacing.md}px`, textAlign: 'center', fontSize: '13px', color: redesignText.secondary }}>
              Aucun résultat trouvé
            </div>
          ) : (
            Object.entries(groupedItems).map(([category, categoryItems]) => (
              <div key={category} style={{ marginBottom: `${redesignSpacing.sm}px` }}>
                <div
                  style={{
                    ...redesignMonoLabelStyle,
                    fontSize: '10px',
                    letterSpacing: '0.12em',
                    color: redesignText.muted,
                    padding: `${redesignSpacing.sm}px ${redesignSpacing.md}px ${redesignSpacing.xs}px`,
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
                        ...listItemSelectionStyle(isHighlighted),
                        padding: `${redesignSpacing.sm}px ${redesignSpacing.md}px`,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      <div
                        style={{
                          fontSize: remSize('section'),
                          color: isHighlighted ? redesignText.strong : redesignText.row,
                        }}
                      >
                        {item.label}
                      </div>
                      {item.description && (
                        <div style={{ fontSize: remSize('accent'), color: redesignText.secondary }}>{item.description}</div>
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
            marginTop: `${redesignSpacing.sm}px`,
            paddingTop: `${redesignSpacing.sm}px`,
            borderTop: `1px solid ${redesignHairline.standard}`,
            fontSize: '11px',
            color: redesignText.muted,
            display: 'flex',
            flexWrap: 'wrap',
            gap: `${redesignSpacing.md}px`,
            justifyContent: 'center',
          }}
        >
          <span>
            <kbd style={kbdStyle}>↑↓</kbd> Naviguer
          </span>
          <span>
            <kbd style={kbdStyle}>Enter</kbd> Sélectionner
          </span>
          <span>
            <kbd style={kbdStyle}>Esc</kbd> Fermer
          </span>
        </div>
      </div>
    </div>
  )
}

