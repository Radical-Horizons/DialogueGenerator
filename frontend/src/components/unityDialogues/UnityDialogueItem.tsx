/**
 * Composant pour afficher un item de dialogue Unity dans la liste.
 */
import { memo } from 'react'
import { theme } from '../../theme'
import type { UnityDialogueMetadata } from '../../types/api'
import { highlightText } from '../../utils/textHighlight'

interface UnityDialogueItemProps {
  dialogue: UnityDialogueMetadata
  onClick: () => void
  isSelected: boolean
  searchQuery?: string
}

export const UnityDialogueItem = memo(function UnityDialogueItem({
  dialogue,
  onClick,
  isSelected,
  searchQuery = '',
}: UnityDialogueItemProps) {
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

  const formatFilename = (filename: string): string => {
    // Enlever l'extension .json et remplacer les underscores par des espaces
    const formatted = filename.replace(/\.json$/, '').replace(/_/g, ' ')
    // Ajouter une majuscule au premier mot
    return formatted.charAt(0).toUpperCase() + formatted.slice(1)
  }

  // Utiliser le nom du fichier formaté comme titre
  const titleText = formatFilename(dialogue.filename)

  return (
    <button
      type="button"
      data-testid="unity-dialogue-item"
      aria-pressed={isSelected}
      title={titleText}
      onClick={onClick}
      style={{
        width: '100%',
        padding: '0.5rem',
        borderBottom: `1px solid ${theme.border.primary}`,
        borderTop: 'none',
        borderLeft: 'none',
        borderRight: 'none',
        backgroundColor: isSelected ? theme.state.selected.background : 'transparent',
        color: theme.text.primary,
        cursor: 'pointer',
        transition: 'background-color 0.2s',
        textAlign: 'left',
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
      <div
        data-testid="unity-dialogue-item-title"
        style={{
          fontSize: '0.82rem',
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
          fontSize: '0.7rem',
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
    </button>
  )
})
