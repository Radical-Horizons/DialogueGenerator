/**
 * Composant pour afficher un résumé des sélections de contexte actives.
 * Permet la suppression individuelle (bouton X) et le changement de mode (Complet/Extrait)
 * par entité lorsque les callbacks onRemoveEntity et onModeChange sont fournis.
 */
import { memo, useCallback } from 'react'
import type { ContextSelection, ElementMode } from '../../types/api'
import { theme } from '../../theme'
import { remSize } from '../../theme/uiTypography'
import * as contextAPI from '../../api/context'
import { useContextStore } from '../../store/contextStore'
import { useGenerationStore } from '../../store/generationStore'
import { getErrorMessage } from '../../types/errors'
import { Badge } from '../shared'

export type EntityType = 'characters' | 'locations' | 'items' | 'species' | 'communities'

interface SelectedContextSummaryProps {
  selections: ContextSelection
  onClear: () => void
  /** Callback appelé quand l'utilisateur retire une entité individuelle. Si absent, le bouton X n'est pas affiché. */
  onRemoveEntity?: (entityType: EntityType, name: string) => void
  /** Callback appelé quand l'utilisateur bascule le mode d'une entité. Si absent, le badge de mode n'est pas affiché. */
  onModeChange?: (entityType: EntityType, name: string, mode: ElementMode) => void
  onError?: (error: string) => void
  onSuccess?: (message: string) => void
}

// --- Sous-composant extrait pour la liste d'entités par catégorie ---

interface EntityCategoryListProps {
  label: string
  entityType: EntityType
  fullItems: string[]
  excerptItems: string[]
  onRemoveEntity?: (entityType: EntityType, name: string) => void
  onModeChange?: (entityType: EntityType, name: string, mode: ElementMode) => void
}

const EntityCategoryList = memo(function EntityCategoryList({
  label,
  entityType,
  fullItems,
  excerptItems,
  onRemoveEntity,
  onModeChange,
}: EntityCategoryListProps) {
  const total = fullItems.length + excerptItems.length
  if (total === 0) return null

  const allItems: Array<{ name: string; mode: ElementMode }> = [
    ...fullItems.map((name) => ({ name, mode: 'full' as ElementMode })),
    ...excerptItems.map((name) => ({ name, mode: 'excerpt' as ElementMode })),
  ]

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <strong style={{ color: theme.text.primary }}>{label}: {total}</strong>
      <div style={{ marginLeft: '1rem', marginTop: '0.25rem' }}>
        {allItems.map(({ name, mode }) => (
          <div
            key={name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              marginBottom: '0.2rem',
              minWidth: 0,
            }}
          >
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name}
            </span>
            {onModeChange && (
              <Badge
                variant={mode === 'excerpt' ? 'warning' : 'neutral'}
                size="sm"
                icon={mode === 'full' ? '📄' : '✂️'}
                data-testid={`mode-toggle-${entityType}-${name}`}
                onClick={() => onModeChange(entityType, name, mode === 'full' ? 'excerpt' : 'full')}
                title={
                  mode === 'full'
                    ? 'Complet — cliquer pour passer en Extrait'
                    : 'Extrait — cliquer pour passer en Complet'
                }
                style={{
                  flexShrink: 0,
                  minWidth: '60px',
                  justifyContent: 'center',
                  gap: '0.25rem',
                }}
              >
                {mode === 'full' ? 'Complet' : 'Extrait'}
              </Badge>
            )}
            {onRemoveEntity && (
              <button
                type="button"
                aria-label={`Retirer ${name} de la sélection`}
                onClick={() => onRemoveEntity(entityType, name)}
                style={{
                  flexShrink: 0,
                  padding: '0.1rem 0.4rem',
                  fontSize: remSize('small'),
                  fontWeight: 'bold',
                  border: `1px solid ${theme.border.primary}`,
                  borderRadius: '3px',
                  backgroundColor: 'transparent',
                  color: theme.text.secondary,
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
})

// --- Composant principal ---

export const SelectedContextSummary = memo(function SelectedContextSummary({
  selections,
  onClear,
  onRemoveEntity,
  onModeChange,
  onError,
  onSuccess,
}: SelectedContextSummaryProps) {
  const { sceneSelection } = useGenerationStore()
  const { applyLinkedElements } = useContextStore()

  const handleLinkElements = useCallback(async () => {
    try {
      const response = await contextAPI.getLinkedElements({
        character_a: sceneSelection.characterA || undefined,
        character_b: sceneSelection.characterB || undefined,
        scene_region: sceneSelection.sceneRegion || undefined,
        sub_location: sceneSelection.subLocation || undefined,
      })
      applyLinkedElements(response.linked_elements)
      onSuccess?.(`${response.total} éléments liés ajoutés`)
    } catch (err) {
      onError?.(getErrorMessage(err))
    }
  }, [sceneSelection, applyLinkedElements, onError, onSuccess])

  const safeLength = (arr: unknown[] | undefined): number =>
    Array.isArray(arr) ? arr.length : 0

  const totalSelected = selections
    ? safeLength(selections.characters_full) + safeLength(selections.characters_excerpt) +
      safeLength(selections.locations_full) + safeLength(selections.locations_excerpt) +
      safeLength(selections.items_full) + safeLength(selections.items_excerpt) +
      safeLength(selections.species_full) + safeLength(selections.species_excerpt) +
      safeLength(selections.communities_full) + safeLength(selections.communities_excerpt) +
      safeLength(selections.dialogues_examples)
    : 0

  return (
    <details
      data-testid="selected-context-summary"
      style={{
        flexShrink: 0,
        borderBottom: `1px solid ${theme.border.primary}`,
        backgroundColor: theme.background.secondary,
      }}
    >
      <summary
        data-testid="selected-context-summary-toggle"
        style={{
          padding: '0.45rem 0.75rem',
          cursor: 'pointer',
          fontSize: '0.8rem',
          fontWeight: 600,
          color: theme.text.primary,
        }}
      >
        Sélections actives ({totalSelected})
      </summary>
      <div style={{ padding: '0.5rem 0.75rem', display: 'grid', gap: '0.4rem' }}>
        {totalSelected === 0 ? (
          <span style={{ color: theme.text.secondary, fontSize: '0.75rem' }}>Aucune sélection</span>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  void handleLinkElements()
                }}
                disabled={!sceneSelection.characterA && !sceneSelection.characterB && !sceneSelection.sceneRegion}
                style={{
                  padding: '0.25rem 0.5rem',
                  fontSize: remSize('small'),
                  border: `1px solid ${theme.border.primary}`,
                  borderRadius: '4px',
                  backgroundColor: theme.button.default.background,
                  color: theme.button.default.color,
                  cursor: !sceneSelection.characterA && !sceneSelection.characterB && !sceneSelection.sceneRegion
                    ? 'not-allowed' : 'pointer',
                  opacity: !sceneSelection.characterA && !sceneSelection.characterB && !sceneSelection.sceneRegion
                    ? 0.5 : 1,
                }}
                title="Coche automatiquement les éléments (personnages, lieux) liés aux personnages A/B et à la scène sélectionnés"
              >
                Lier Éléments Connexes
              </button>
              <button
                type="button"
                onClick={() => onClear()}
                style={{
                  padding: '0.25rem 0.5rem',
                  fontSize: remSize('small'),
                  border: `1px solid ${theme.border.primary}`,
                  borderRadius: '4px',
                  backgroundColor: theme.button.default.background,
                  color: theme.button.default.color,
                  cursor: 'pointer',
                }}
              >
                Tout effacer
              </button>
            </div>
            <div style={{ fontSize: remSize('accent'), color: theme.text.secondary }}>
              <EntityCategoryList
                label="Personnages"
                entityType="characters"
                fullItems={Array.isArray(selections?.characters_full) ? selections.characters_full : []}
                excerptItems={Array.isArray(selections?.characters_excerpt) ? selections.characters_excerpt : []}
                onRemoveEntity={onRemoveEntity}
                onModeChange={onModeChange}
              />
              <EntityCategoryList
                label="Lieux"
                entityType="locations"
                fullItems={Array.isArray(selections?.locations_full) ? selections.locations_full : []}
                excerptItems={Array.isArray(selections?.locations_excerpt) ? selections.locations_excerpt : []}
                onRemoveEntity={onRemoveEntity}
                onModeChange={onModeChange}
              />
              <EntityCategoryList
                label="Objets"
                entityType="items"
                fullItems={Array.isArray(selections?.items_full) ? selections.items_full : []}
                excerptItems={Array.isArray(selections?.items_excerpt) ? selections.items_excerpt : []}
                onRemoveEntity={onRemoveEntity}
                onModeChange={onModeChange}
              />
              <EntityCategoryList
                label="Espèces"
                entityType="species"
                fullItems={Array.isArray(selections?.species_full) ? selections.species_full : []}
                excerptItems={Array.isArray(selections?.species_excerpt) ? selections.species_excerpt : []}
                onRemoveEntity={onRemoveEntity}
                onModeChange={onModeChange}
              />
              <EntityCategoryList
                label="Communautés"
                entityType="communities"
                fullItems={Array.isArray(selections?.communities_full) ? selections.communities_full : []}
                excerptItems={Array.isArray(selections?.communities_excerpt) ? selections.communities_excerpt : []}
                onRemoveEntity={onRemoveEntity}
                onModeChange={onModeChange}
              />
              {safeLength(selections?.dialogues_examples) > 0 && (
                <div style={{ marginTop: '0.5rem' }}>
                  <strong style={{ color: theme.text.primary }}>
                    Exemples de dialogues: {safeLength(selections?.dialogues_examples)}
                  </strong>
                  <div style={{ marginLeft: '1rem', marginTop: '0.25rem' }}>
                    {(Array.isArray(selections?.dialogues_examples) ? selections.dialogues_examples : []).join(', ')}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </details>
  )
})
