/**
 * Composant pour afficher un item de dialogue Unity dans la liste.
 */
import { forwardRef, memo, type CSSProperties, type KeyboardEvent } from 'react'
import { theme } from '../../theme'
import { remSize } from '../../theme/uiTypography'
import type { UnityDialogueMetadata } from '../../types/api'
import { highlightText } from '../../utils/textHighlight'
import { getDialogueDisplayTitle } from '../../utils/formatDialogueTitle'

export interface UnityDialogueItemProps {
  dialogue: UnityDialogueMetadata
  onClick: () => void
  isSelected: boolean
  searchQuery?: string
  /**
   * Variante listbox (Story 17.7 `DialogueCombobox`) : `role="option"` +
   * `aria-selected` + roving `tabIndex` pour navigation clavier.
   */
  asListboxOption?: boolean
  optionId?: string
  isActiveOption?: boolean
  onOptionKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void
}

const itemInteractiveStyle: CSSProperties = {
  width: '100%',
  padding: '0.5rem',
  borderBottom: `1px solid ${theme.border.primary}`,
  borderTop: 'none',
  borderLeft: 'none',
  borderRight: 'none',
  backgroundColor: 'transparent',
  color: theme.text.primary,
  cursor: 'pointer',
  transition: 'background-color 0.2s',
  textAlign: 'left',
  boxSizing: 'border-box',
}

export const UnityDialogueItem = memo(
  forwardRef<HTMLButtonElement | HTMLDivElement, UnityDialogueItemProps>(
    function UnityDialogueItem(
      {
        dialogue,
        onClick,
        isSelected,
        searchQuery = '',
        asListboxOption = false,
        optionId,
        isActiveOption = false,
        onOptionKeyDown,
      },
      ref
    ) {
      const formatSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
      }

      const formatDate = (isoString: string): string => {
        const date = new Date(isoString)
        return date.toLocaleDateString('fr-FR', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      }

      const titleText = getDialogueDisplayTitle(dialogue)

      const bgForState = isSelected ? theme.state.selected.background : 'transparent'

      const body = (
        <>
          <div
            data-testid="unity-dialogue-item-title"
            style={{
              fontSize: remSize('unityListTitle'),
              fontWeight: 600,
              lineHeight: 1.25,
              marginBottom: '0.2rem',
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 2,
              overflow: 'hidden',
              wordBreak: 'break-word',
            }}
          >
            {highlightText(titleText, searchQuery)}
          </div>
          <div
            style={{
              fontSize: '0.7rem',
              color: theme.text.tertiary,
              marginBottom: '0.2rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {highlightText(dialogue.filename, searchQuery)}
          </div>
          <div
            style={{
              fontSize: remSize('caption'),
              color: theme.text.tertiary,
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.35rem',
            }}
          >
            <span>{formatSize(dialogue.size_bytes)}</span>
            <span aria-hidden>•</span>
            <span>{formatDate(dialogue.modified_time)}</span>
          </div>
        </>
      )

      if (asListboxOption) {
        return (
          <div
            ref={ref as React.Ref<HTMLDivElement>}
            id={optionId}
            role="option"
            aria-selected={isSelected}
            tabIndex={isActiveOption ? 0 : -1}
            data-testid="unity-dialogue-item"
            title={titleText}
            onClick={onClick}
            onKeyDown={onOptionKeyDown}
            style={{
              ...itemInteractiveStyle,
              backgroundColor: bgForState,
            }}
            onMouseEnter={(e) => {
              if (!isSelected) {
                e.currentTarget.style.backgroundColor = theme.state.hover.background
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelected) {
                e.currentTarget.style.backgroundColor = 'transparent'
              }
            }}
          >
            {body}
          </div>
        )
      }

      return (
        <button
          ref={ref as React.Ref<HTMLButtonElement>}
          type="button"
          data-testid="unity-dialogue-item"
          aria-pressed={isSelected}
          title={titleText}
          onClick={onClick}
          style={{
            ...itemInteractiveStyle,
            backgroundColor: bgForState,
          }}
          onMouseEnter={(e) => {
            if (!isSelected) {
              e.currentTarget.style.backgroundColor = theme.state.hover.background
            }
          }}
          onMouseLeave={(e) => {
            if (!isSelected) {
              e.currentTarget.style.backgroundColor = 'transparent'
            }
          }}
        >
          {body}
        </button>
      )
    }
  )
)
