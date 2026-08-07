/**
 * Barre de recherche + tri du catalogue GDD (partagée panneau / liste).
 */
import type { RefObject } from 'react'
import { theme } from '../../theme'
import { StyledSelect } from '../shared/StyledSelect'
import { redesignFont, redesignHairline, redesignText } from '../../theme/redesignTokens'

export type ContextSortType = 'name-asc' | 'name-desc' | 'selected-first'

interface ContextSearchControlsProps {
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  sortType: ContextSortType
  onSortTypeChange: (value: ContextSortType) => void
  inputRef?: RefObject<HTMLInputElement>
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
        padding: '14px 20px 10px',
        borderTop: `1px solid ${redesignHairline.standard}`,
        backgroundColor: 'transparent',
      }}
    >
      {/* Le tri passe sous le champ quand la colonne se resserre : c'est le
          libellé de saisie qui doit rester lisible, pas l'inverse (vu à 212 px
          sur l'écran 2d, où il ne restait que « R »). */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'center',
          flexWrap: 'wrap',
          rowGap: 6,
        }}
      >
        {/* 1c : un simple libellé de saisie, pas un champ encadré. */}
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          aria-label="Rechercher dans le GDD"
          style={{
            // Base large : le tri déborde et passe à la ligne avant que le
            // placeholder ne se tronque.
            flex: '1 1 150px',
            minWidth: 0,
            padding: 0,
            border: 'none',
            borderRadius: 0,
            backgroundColor: 'transparent',
            color: theme.text.primary,
            fontSize: '13.5px',
            outline: 'none',
          }}
        />
        <StyledSelect
          value={sortType}
          onChange={(e) => onSortTypeChange(e.target.value as ContextSortType)}
          style={{
            padding: 0,
            border: 'none',
            borderRadius: 0,
            backgroundColor: 'transparent',
            color: redesignText.label,
            fontFamily: redesignFont.mono,
            fontSize: '9.5px',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
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
