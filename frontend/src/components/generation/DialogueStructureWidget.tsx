/**
 * Widget pour définir la structure du dialogue à générer.
 */
import { memo, useCallback } from 'react'
import { Select, type SelectOption } from '../shared/Select'
import { FormField } from '../shared/FormField'
import { useDialogueStructure } from '../../hooks/useDialogueStructure'
import { theme } from '../../theme'
import { generationPanelChrome } from '../../theme/responsiveChrome'
import { useGenerationPanelNarrow } from './GenerationPanelNarrowContext'
import type { DialogueStructure, DialogueStructureElement } from '../../types/generation'

const STRUCTURE_OPTIONS: SelectOption[] = [
  { value: '', label: '(Vide)' },
  { value: 'PNJ', label: 'PNJ' },
  { value: 'PJ', label: 'PJ' },
  { value: 'Stop', label: 'Stop' },
]

const HELP_TEXT = `Définissez l'ordre et le type d'éléments pour le dialogue généré :

• PNJ : Le PNJ parle (dialogue direct)
• PJ : Le PJ fait un choix (choix multiples)
• Stop : Fin de la séquence
• (Vide) : Emplacement non utilisé

Exemple typique : PNJ → PJ → Stop
Structure complexe : PNJ → PJ → PNJ → PJ → Stop`

interface DialogueStructureWidgetProps {
  value?: DialogueStructure
  onChange?: (structure: DialogueStructure) => void
}

export const DialogueStructureWidget = memo(function DialogueStructureWidget({
  value,
  onChange,
}: DialogueStructureWidgetProps) {
  const isNarrow = useGenerationPanelNarrow()
  const chrome = isNarrow ? generationPanelChrome.narrow : generationPanelChrome.comfortable
  const {
    structure,
    updateElement,
    validate,
  } = useDialogueStructure(value)

  const handleElementChange = useCallback(
    (index: number, newValue: string) => {
      const elementValue = newValue as DialogueStructureElement
      updateElement(index, elementValue)
      const newStructure = [...structure]
      newStructure[index] = elementValue
      onChange?.(newStructure as DialogueStructure)
    },
    [structure, updateElement, onChange]
  )

  const isValid = validate()

  return (
    <div
      style={{
        padding: chrome.cardPadding,
        border: `1px solid ${theme.border.primary}`,
        borderRadius: '4px',
        backgroundColor: theme.background.panel,
        marginBottom: '1rem',
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.75rem',
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: `${chrome.sectionTitleFontRem}rem`,
            fontWeight: 'bold',
            color: theme.text.primary,
          }}
        >
          Structure du Dialogue
        </h3>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <button
            type="button"
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '12px',
              border: `1px solid ${theme.border.primary}`,
              backgroundColor: theme.background.secondary,
              color: theme.text.secondary,
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
            title={HELP_TEXT}
            onMouseEnter={() => {
              // On pourrait ajouter un tooltip custom ici
            }}
          >
            ?
          </button>
        </div>
      </div>

      <div
        data-testid="dialogue-structure-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: chrome.structureGridTemplateColumns,
          gap: `${chrome.structureGapRem}rem`,
          marginBottom: '0.5rem',
          minWidth: 0,
        }}
      >
        {structure.map((element, index) => (
          <div key={index} style={{ minWidth: 0 }}>
            <FormField
              label={`Position ${index + 1}`}
              style={{ marginBottom: 0 }}
              labelStyle={{
                fontSize: `${chrome.labelFontRem}rem`,
                marginBottom: isNarrow ? '0.25rem' : '0.5rem',
              }}
            >
              <Select
                options={STRUCTURE_OPTIONS}
                value={element}
                onChange={(value) => handleElementChange(index, value || '')}
                placeholder="Vide"
                compact={isNarrow}
                style={{ width: '100%', minWidth: 0 }}
              />
            </FormField>
          </div>
        ))}
      </div>

      {!isValid && (
        <div
          style={{
            padding: '0.5rem',
            backgroundColor: theme.state.error.background,
            color: theme.state.error.color,
            borderRadius: '4px',
            fontSize: isNarrow ? '0.78rem' : '0.85rem',
            marginTop: '0.5rem',
          }}
        >
          La structure doit avoir au moins un élément avant "Stop"
        </div>
      )}
    </div>
  )
})

