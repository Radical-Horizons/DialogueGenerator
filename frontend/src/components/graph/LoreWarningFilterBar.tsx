import { theme } from '../../theme'

interface LoreWarningFilterBarProps {
  loreTypeOptions: string[]
  typeFilter: 'all' | string
  setTypeFilter: (v: 'all' | string) => void
  showIgnored: boolean
  setShowIgnored: (v: boolean) => void
  dismissibleVisibleCount: number
}

export function LoreWarningFilterBar({
  loreTypeOptions,
  typeFilter,
  setTypeFilter,
  showIgnored,
  setShowIgnored,
  dismissibleVisibleCount,
}: LoreWarningFilterBarProps) {
  if (loreTypeOptions.length === 0) {
    return null
  }
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '0.5rem',
        marginBottom: '0.65rem',
        fontSize: '0.75rem',
        color: theme.text.secondary,
      }}
      data-testid="lore-warning-filters"
    >
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        <span>Type</span>
        <select
          aria-label="Filtrer les avertissements lore par type"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as 'all' | string)}
          style={{ fontSize: '0.75rem', padding: '0.15rem 0.35rem' }}
        >
          <option value="all">Tous les types lore révisables</option>
          {loreTypeOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={showIgnored}
          onChange={(e) => setShowIgnored(e.target.checked)}
        />
        Afficher les ignorés
      </label>
      {dismissibleVisibleCount > 0 ? (
        <span
          style={{ fontWeight: 600, color: theme.state.lore.color }}
          data-testid="lore-potential-display-count"
        >
          {dismissibleVisibleCount} incohérence{dismissibleVisibleCount > 1 ? 's' : ''} potentielle
          {dismissibleVisibleCount > 1 ? 's' : ''} affichée{dismissibleVisibleCount > 1 ? 's' : ''}{' '}
          (hors ignorés)
        </span>
      ) : (
        <span data-testid="lore-potential-display-count">
          0 incohérence potentielle affichée (hors ignorés)
        </span>
      )}
    </div>
  )
}
