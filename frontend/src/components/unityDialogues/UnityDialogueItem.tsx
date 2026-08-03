/**
 * Composant pour afficher un item de dialogue Unity dans la liste.
 */
import {
  forwardRef,
  memo,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import { theme } from '../../theme'
import { remSize } from '../../theme/uiTypography'
import { listItemSelectionStyle } from '../../theme/selectionTokens'
import type { UnityDialogueMetadata } from '../../types/api'
import { highlightText } from '../../utils/textHighlight'
import { getDialogueDisplayTitle } from '../../utils/formatDialogueTitle'
import { formatCostEur, formatRelativeTime } from '../../utils/dialogueMetadataFormat'

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
  /** Collections contenant ce dialogue (FR84). */
  collections?: Array<{ id: string; name: string; icon?: string | null }>
  /** Clic sur un badge collection → active le filtre. */
  onCollectionClick?: (collectionId: string) => void
}

const MAX_DISPLAYED_SPEAKERS = 8

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
        collections = [],
        onCollectionClick,
      },
      ref
    ) {
      const [isHovered, setIsHovered] = useState(false)
      const [showMetadataTooltip, setShowMetadataTooltip] = useState(false)
      const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
      const showFilename = isSelected || isHovered

      useEffect(
        () => () => {
          if (tooltipTimer.current) clearTimeout(tooltipTimer.current)
        },
        []
      )

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
      const shareCount = Math.max(0, dialogue.share_count ?? 0)
      const sharingLabel =
        shareCount === 0 ? 'Privé' : `Co-édité (${shareCount})`
      const relativeModifiedTime = formatRelativeTime(dialogue.modified_time)
      const metadataTooltip = `${dialogue.node_count ?? 0} nœud${
        dialogue.node_count === 1 ? '' : 's'
      }${
        dialogue.total_cost_eur != null && dialogue.total_cost_eur > 0
          ? `, ${formatCostEur(dialogue.total_cost_eur)}`
          : ''
      }, modifié ${relativeModifiedTime}${
        dialogue.last_modified_by_username
          ? ` par ${dialogue.last_modified_by_username}`
          : ''
      }`

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
            {dialogue.node_count != null && (
              <>
                <span aria-hidden>•</span>
                <span data-testid="unity-dialogue-item-node-count">
                  {dialogue.node_count} nœud{dialogue.node_count > 1 ? 's' : ''}
                </span>
              </>
            )}
            {dialogue.total_cost_eur != null && dialogue.total_cost_eur > 0 && (
              <>
                <span aria-hidden>•</span>
                <span data-testid="unity-dialogue-item-cost">
                  {formatCostEur(dialogue.total_cost_eur)}
                </span>
              </>
            )}
            {dialogue.speakers && dialogue.speakers.length > 0 && (
              <>
                <span aria-hidden>•</span>
                <span
                  data-testid="unity-dialogue-item-speakers"
                  title={dialogue.speakers.join(', ')}
                >
                  {highlightText(
                    dialogue.speakers.slice(0, MAX_DISPLAYED_SPEAKERS).join(', '),
                    searchQuery
                  )}
                  {dialogue.speakers.length > MAX_DISPLAYED_SPEAKERS &&
                    ` +${dialogue.speakers.length - MAX_DISPLAYED_SPEAKERS}`}
                </span>
              </>
            )}
            {(dialogue.owner_username || dialogue.owner_id) && (
              <>
                <span aria-hidden>•</span>
                <span
                  data-testid="unity-dialogue-item-author"
                  title="Auteur"
                >
                  {dialogue.owner_username || 'Auteur inconnu'}
                </span>
              </>
            )}
            <span aria-hidden>•</span>
            <span title="Dernière modification">{relativeModifiedTime}</span>
            {dialogue.created_at && (
              <>
                <span aria-hidden>•</span>
                <span
                  data-testid="unity-dialogue-item-created"
                  title="Date de création"
                >
                  créé {formatDate(dialogue.created_at)}
                </span>
              </>
            )}
            <span
              data-testid="unity-dialogue-sharing-badge"
              title={sharingLabel}
              style={{
                padding: '0.05rem 0.3rem',
                borderRadius: '999px',
                border: `1px solid ${theme.border.primary}`,
                color: theme.text.secondary,
              }}
            >
              {sharingLabel}
            </span>
            {collections.map((collection) => (
              <button
                key={collection.id}
                type="button"
                data-testid={`unity-dialogue-collection-badge-${collection.id}`}
                title={`Ouvrir la collection ${collection.name}`}
                onClick={(event) => {
                  event.stopPropagation()
                  onCollectionClick?.(collection.id)
                }}
                style={{
                  padding: '0.05rem 0.3rem',
                  borderRadius: '999px',
                  border: `1px solid ${theme.border.primary}`,
                  backgroundColor: 'transparent',
                  color: theme.text.secondary,
                  cursor: onCollectionClick ? 'pointer' : 'default',
                  fontSize: 'inherit',
                }}
              >
                {collection.icon ? `${collection.icon} ` : ''}
                {collection.name}
              </button>
            ))}
          </div>
          {showMetadataTooltip && (
            <div
              role="tooltip"
              data-testid="unity-dialogue-metadata-tooltip"
              style={{
                position: 'absolute',
                zIndex: 20,
                left: '0.5rem',
                right: '0.5rem',
                bottom: 'calc(100% - 0.25rem)',
                padding: '0.45rem 0.6rem',
                borderRadius: 6,
                border: `1px solid ${theme.border.primary}`,
                backgroundColor: theme.background.secondary,
                color: theme.text.primary,
                boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
                fontSize: '0.72rem',
                pointerEvents: 'none',
              }}
            >
              {metadataTooltip}
            </div>
          )}
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
        position: 'relative' as const,
      }

      const hoverHandlers = {
        onMouseEnter: (e: MouseEvent<HTMLElement>) => {
          setIsHovered(true)
          setShowMetadataTooltip(true)
          if (tooltipTimer.current) clearTimeout(tooltipTimer.current)
          tooltipTimer.current = setTimeout(
            () => setShowMetadataTooltip(false),
            3000
          )
          if (!isSelected) {
            e.currentTarget.style.backgroundColor = theme.state.hover.background
          }
        },
        onMouseLeave: (e: MouseEvent<HTMLElement>) => {
          setIsHovered(false)
          setShowMetadataTooltip(false)
          if (tooltipTimer.current) clearTimeout(tooltipTimer.current)
          if (!isSelected) {
            e.currentTarget.style.backgroundColor = 'transparent'
          }
        },
      }

      const handleClick = () => {
        setShowMetadataTooltip(false)
        if (tooltipTimer.current) clearTimeout(tooltipTimer.current)
        onClick()
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
            aria-label={titleText}
            onClick={handleClick}
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
            aria-label={titleText}
            aria-pressed={isSelected}
            onContextMenu={onContextMenu}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              width: '100%',
              borderBottom: `1px solid ${theme.border.primary}`,
              ...selectionStyle,
            }}
            {...hoverHandlers}
          >
            {batchCheckbox}
            <button
              ref={ref as React.Ref<HTMLButtonElement>}
              type="button"
              aria-pressed={isSelected}
              onClick={handleClick}
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
          aria-label={titleText}
          onClick={handleClick}
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
