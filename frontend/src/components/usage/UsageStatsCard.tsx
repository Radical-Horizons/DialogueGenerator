/**
 * Colonne de statistique d'utilisation LLM : étiquette mono, valeur mono, ligne secondaire.
 * Pas de carte — les colonnes sont séparées par des filets posés par la grille parente.
 */
import type { ReactNode } from 'react'
import { formatNumber } from '../../utils/formatCurrency'
import './UsageStatsCard.css'

interface UsageStatsCardProps {
  title: string
  value: string | number
  unit?: string
  subtitle?: ReactNode
  /** Jauge 2px sous la valeur (0–100+) ; à 100 % ou plus, elle passe en rouge. */
  gaugePercent?: number
  className?: string
}

export function UsageStatsCard({
  title,
  value,
  unit,
  subtitle,
  gaugePercent,
  className = '',
}: UsageStatsCardProps) {
  const gaugeOver = gaugePercent !== undefined && gaugePercent >= 100
  return (
    <div className={`usage-stats-card ${className}`}>
      <div className="usage-stats-card__title">{title}</div>
      <div className="usage-stats-card__value">
        {typeof value === 'number' ? formatNumber(value) : value}
        {unit && <span className="usage-stats-card__unit">{unit}</span>}
      </div>
      {gaugePercent !== undefined && (
        <div className="usage-stats-card__gauge" aria-hidden="true">
          <div
            className={`usage-stats-card__gauge-fill${gaugeOver ? ' usage-stats-card__gauge-fill--over' : ''}`}
            style={{ width: `${Math.max(0, Math.min(100, gaugePercent))}%` }}
          />
        </div>
      )}
      {subtitle && <div className="usage-stats-card__subtitle">{subtitle}</div>}
    </div>
  )
}
