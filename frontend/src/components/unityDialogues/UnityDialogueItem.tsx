/**
 * Composant pour afficher un item de dialogue Unity dans la liste.
 */
import { forwardRef, memo, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react'
import { theme } from '../../theme'
import { remSize } from '../../theme/uiTypography'
import { listItemSelectionStyle } from '../../theme/selectionTokens'
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
  onContextMenu?: (e: MouseEvent<HTMLButtonElement | HTMLDivElement>) => void
  /** Mode batch export (Story 5.2) : checkbox de sélection. */
  batchMode?: boolean
  isChecked?: boolean
  onCheckChange?: (checked: boolean) => void
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
        onContextMenu,
        batchMode = false,
        isChecked = false,
        onCheckChange,
      },
      ref
    ) {
      const [isHovered, setIsHovered] = useState(false)
      const showFilename = isSelected || isHovered

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

      const selectionStyle = listItemSelectionStyle(isSelected)

      const body = (
        <>
          <div
            data-testid="unity-dialogue-item-title"
            style={{
              fontSize: remSize('unityListTitle'),
              fontWeight: isSelected ? 700 : 600,
              lineHeight: 1.2,
              marginBottom: showFilename ? '0.15rem' : '0.1rem',
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 1,
              overflow: 'hidden',
              wordBreak: 'break-word',
              color: isSelected ? theme.text.primary : theme.text.secondary,
            }}
          >
            {highlightText(titleText, searchQuery)}
          </div>
          {showFilename && (
            <div
              style={{
                fontSize: '0.65rem',
                color: theme.text.tertiary,
                marginBottom: '0.15rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {highlightText(dialogue.filename, searchQuery)}
            </div>
          )}
          <div
            style={{
              fontSize: '0.65rem',
              color: theme.text.tertiary,
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.3rem',
            }}
          >
            <span>{formatSize(dialogue.size_bytes)}</span>
            <span aria-hidden>•</span>
            <span>{formatDate(dialogue.modified_time)}</span>
          </div>
        </>
      )

      const batchCheckbox = batchMode ? (
        <input
          type="checkbox"
          data-testid="unity-dialogue-item-checkbox"
          checked={isChecked}
          onChange={(e) => onCheckChange?.(e.target.checked)}
          aria-label={`Sélectionner ${titleText}`}
          style={{ marginRight: '0.35rem', flexShrink: 0, marginTop: '0.15rem' }}
        />
      ) : null

      const interactiveStyle = {
        ...itemInteractiveStyle,
        ...selectionStyle,
        flex: batchMode ? 1 : undefined,
        minWidth: 0,
      }

      const hoverHandlers = {
        onMouseEnter: (e: MouseEvent<HTMLElement>) => {
          setIsHovered(true)
          if (!isSelected) {
            e.currentTarget.style.backgroundColor = theme.state.hover.background
          }
        },
        onMouseLeave: (e: MouseEvent<HTMLElement>) => {
          setIsHovered(false)
          if (!isSelected) {
            e.currentTarget.style.backgroundColor = 'transparent'
          }
        },
      }

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
            onContextMenu={onContextMenu}
            onKeyDown={onOptionKeyDown}
            style={{
              ...interactiveStyle,
              display: batchMode ? 'flex' : itemInteractiveStyle.display,
              alignItems: batchMode ? 'flex-start' : undefined,
            }}
            {...hoverHandlers}
          >
            {batchCheckbox}
            <div style={{ flex: 1, minWidth: 0 }}>{body}</div>
          </div>
        )
      }

      if (batchMode) {
        return (
          <div
            data-testid="unity-dialogue-item"
            title={titleText}
            aria-pressed={isSelected}
            onContextMenu={onContextMenu}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              width: '100%',
              borderBottom: `1px solid ${theme.border.primary}`,
              ...selectionStyle,
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            {batchCheckbox}
            <button
              ref={ref as React.Ref<HTMLButtonElement>}
              type="button"
              aria-pressed={isSelected}
              onClick={onClick}
              onContextMenu={onContextMenu}
              style={{
                ...interactiveStyle,
                borderBottom: 'none',
                display: 'block',
              }}
            >
              {body}
            </button>
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
          onContextMenu={onContextMenu}
          style={interactiveStyle}
          {...hoverHandlers}
        >
          {body}
        </button>
      )
    }
  )
)
