/**
 * Dashboard de suivi d'utilisation LLM.
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { getUsageStatistics, type LLMUsageStatistics } from '../../api/llmUsage'
import { getBudget, getUsage, type BudgetResponse, type UsageResponse } from '../../api/costs'
import { UsageStatsCard } from './UsageStatsCard'
import { UsageHistoryTable } from './UsageHistoryTable'
import { getErrorMessage } from '../../types/errors'
import './UsageDashboard.css'

type BudgetTone = 'ok' | 'warning' | 'over'

// Le seuil 100 % est testé en premier : dans l'ordre inverse, « dépassé » n'était jamais atteint.
function budgetStatusOf(percentage: number): { tone: BudgetTone; label: string } {
  if (percentage >= 100) return { tone: 'over', label: 'Budget dépassé' }
  if (percentage >= 90) return { tone: 'warning', label: 'Approche de la limite' }
  return { tone: 'ok', label: 'Dans les limites' }
}

export function UsageDashboard() {
  const defaultDates = useMemo(() => {
    const today = new Date()
    const thirtyDaysAgo = new Date(today)
    thirtyDaysAgo.setDate(today.getDate() - 30)
    return {
      start: thirtyDaysAgo.toISOString().split('T')[0],
      end: today.toISOString().split('T')[0],
    }
  }, [])

  const [statistics, setStatistics] = useState<LLMUsageStatistics | null>(null)
  const [budget, setBudget] = useState<BudgetResponse | null>(null)
  const [usage, setUsage] = useState<UsageResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [startDate, setStartDate] = useState<string | null>(() => defaultDates.start)
  const [endDate, setEndDate] = useState<string | null>(() => defaultDates.end)
  const [model, setModel] = useState<string | null>(null)

  const loadStatistics = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [stats, budgetData, usageData] = await Promise.all([
        getUsageStatistics(startDate, endDate, model),
        getBudget(),
        getUsage(),
      ])
      setStatistics(stats)
      setBudget(budgetData)
      setUsage(usageData)
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, model])

  useEffect(() => {
    void loadStatistics()
  }, [loadStatistics])

  const formatCost = (cost: number) => {
    if (cost < 0.01) return `$${cost.toFixed(6)}`
    return `$${cost.toFixed(2)}`
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${Math.round(ms)}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  const budgetStatus = budget ? budgetStatusOf(budget.percentage) : null

  return (
    <div className="usage-dashboard">
      <div className="usage-dashboard__inner">
        <div className="usage-dashboard__header">
          <div className="usage-dashboard__eyebrow">Coûts, tokens et appels</div>
          <h1>Suivi d'utilisation LLM</h1>
          <div className="usage-dashboard__filters">
            <div className="filter-group">
              <label htmlFor="start-date">Date de début</label>
              <input
                id="start-date"
                type="date"
                value={startDate || ''}
                onChange={(e) => setStartDate(e.target.value || null)}
                className="filter-input"
              />
            </div>
            <div className="filter-group">
              <label htmlFor="end-date">Date de fin</label>
              <input
                id="end-date"
                type="date"
                value={endDate || ''}
                onChange={(e) => setEndDate(e.target.value || null)}
                className="filter-input"
              />
            </div>
            <div className="filter-group">
              <label htmlFor="model">Modèle</label>
              <input
                id="model"
                type="text"
                value={model || ''}
                onChange={(e) => setModel(e.target.value || null)}
                placeholder="Tous les modèles"
                className="filter-input"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="usage-dashboard__error">
            Erreur: {error}
          </div>
        )}

        {loading ? (
          <div className="usage-dashboard__loading">Chargement des statistiques...</div>
        ) : statistics ? (
          <>
            {budget && budgetStatus && (
              <section className="usage-dashboard__section usage-dashboard__budget-section">
                <h2 className="usage-dashboard__section-title">Budget LLM</h2>
                <div className="usage-dashboard__stats-grid">
                  <UsageStatsCard
                    title="Quota mensuel"
                    value={formatCost(budget.quota)}
                    subtitle="Budget total"
                  />
                  <UsageStatsCard
                    title="Montant dépensé"
                    value={formatCost(budget.amount)}
                    subtitle={
                      <>
                        <span className="usage-dashboard__num">{budget.percentage.toFixed(1)}%</span> utilisé
                      </>
                    }
                  />
                  <UsageStatsCard
                    title="Montant restant"
                    value={formatCost(budget.remaining)}
                    subtitle="Disponible ce mois"
                  />
                  <UsageStatsCard
                    title="Pourcentage utilisé"
                    value={budget.percentage.toFixed(1)}
                    unit="%"
                    gaugePercent={budget.percentage}
                    subtitle={
                      <span className={`usage-dashboard__status usage-dashboard__status--${budgetStatus.tone}`}>
                        {budgetStatus.label}
                      </span>
                    }
                  />
                </div>
              </section>
            )}

            {usage && usage.daily_costs.length > 0 && (
              <section className="usage-dashboard__section usage-dashboard__chart-section">
                <h2 className="usage-dashboard__section-title">Évolution des coûts (mois actuel)</h2>
                <div className="usage-dashboard__chart">
                  <div className="usage-dashboard__chart-bars">
                    {usage.daily_costs.map((daily) => {
                      const maxCost = Math.max(...usage.daily_costs.map(d => d.cost), 1)
                      const heightPercent = (daily.cost / maxCost) * 100
                      return (
                        <div key={daily.date} className="usage-dashboard__chart-bar-container">
                          <div
                            className="usage-dashboard__chart-bar"
                            style={{ height: `${heightPercent}%` }}
                            title={`${daily.date}: ${formatCost(daily.cost)}`}
                          />
                          <div className="usage-dashboard__chart-label">
                            {new Date(daily.date).getDate()}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="usage-dashboard__chart-summary">
                    <div>
                      <span className="usage-dashboard__summary-label">Total du mois</span>
                      <span className="usage-dashboard__num">{formatCost(usage.total)}</span>
                    </div>
                    <div>
                      <span className="usage-dashboard__summary-label">Pourcentage du budget</span>
                      <span className="usage-dashboard__num">{usage.percentage.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              </section>
            )}

            <section className="usage-dashboard__section">
              <h2 className="usage-dashboard__section-title">Appels sur la période</h2>
              <div className="usage-dashboard__stats-grid">
                <UsageStatsCard
                  title="Coût total"
                  value={formatCost(statistics.total_cost)}
                  subtitle={
                    <>
                      <span className="usage-dashboard__num">{statistics.calls_count}</span> appels
                    </>
                  }
                />
                <UsageStatsCard
                  title="Tokens totaux"
                  value={statistics.total_tokens.toLocaleString()}
                  unit="tokens"
                  subtitle={
                    <>
                      <span className="usage-dashboard__num">{statistics.total_prompt_tokens.toLocaleString()}</span> prompt
                      {' + '}
                      <span className="usage-dashboard__num">{statistics.total_completion_tokens.toLocaleString()}</span> completion
                    </>
                  }
                />
                <UsageStatsCard
                  title="Taux de succès"
                  value={statistics.success_rate.toFixed(1)}
                  unit="%"
                  subtitle={
                    <>
                      <span className="usage-dashboard__num">{statistics.success_count}</span> réussis /{' '}
                      <span className="usage-dashboard__num">{statistics.error_count}</span> erreurs
                    </>
                  }
                />
                <UsageStatsCard
                  title="Durée moyenne"
                  value={formatDuration(statistics.avg_duration_ms)}
                  subtitle="Par appel"
                />
              </div>
            </section>

            <section className="usage-dashboard__section usage-dashboard__history">
              <UsageHistoryTable
                startDate={startDate}
                endDate={endDate}
                model={model}
              />
            </section>
          </>
        ) : null}
      </div>
    </div>
  )
}
