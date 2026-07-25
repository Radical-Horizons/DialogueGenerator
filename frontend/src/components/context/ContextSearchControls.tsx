/**
 * Barre de recherche + tri du catalogue GDD (partagée panneau / liste).
 */
import type { RefObject } from 'react'
import { theme } from '../../theme'
import { remSize } from '../../theme/uiTypography'
import { StyledSelect } from '../shared/StyledSelect'

export type ContextSortType = 'name-asc' | 'name-desc' | 'selected-first'

interface ContextSearchControlsProps {
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  sortType: ContextSortType
  onSortTypeChange: (value: ContextSortType) => void
  inputRef?: RefObject<HTMLInputElement | null>
  /** Placeholder du champ recherche. */
  placeholder?: string
}

export function ContextSearchControls({
  searchQuery,
  onSearchQueryChange,
  sortType,
  onSortTypeChange,
  inputRef,
  placeholder = 'Rechercher dans tout le GDD… (/)',
}: ContextSearchControlsProps) {
  return (
    <div
      data-testid="context-search-controls"
      style={{
        flexShrink: 0,
        padding: '0.65rem 0.75rem',
        borderBottom: `1px solid ${theme.border.primary}`,
        backgroundColor: theme.background.tertiary,
      }}
    >
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          aria-label="Rechercher dans le GDD"
          style={{
            flex: 1,
            padding: '0.5rem',
            border: `1px solid ${theme.input.border}`,
            borderRadius: '4px',
            backgroundColor: theme.input.background,
            color: theme.input.color,
          }}
        />
        <StyledSelect
          value={sortType}
          onChange={(e) => onSortTypeChange(e.target.value as ContextSortType)}
          style={{
            padding: '0.5rem',
            border: `1px solid ${theme.input.border}`,
            borderRadius: '4px',
            backgroundColor: theme.input.background,
            color: theme.input.color,
            fontSize: remSize('accent'),
          }}
          wrapperStyle={{ width: 'auto' }}
          title="Trier les résultats"
        >
          <option value="name-asc">Nom (A-Z)</option>
          <option value="name-desc">Nom (Z-A)</option>
          <option value="selected-first">Sélectionnés en premier</option>
        </StyledSelect>
      </div>
    </div>
  )
}
