/**
 * Tableau d'historique d'utilisation LLM.
 */
import { useState, useEffect, useCallback } from 'react'
import { getUsageHistory, type LLMUsageRecord } from '../../api/llmUsage'
import { getErrorMessage } from '../../types/errors'
import { formatCurrency, formatDurationMs, formatNumber } from '../../utils/formatCurrency'
import './UsageHistoryTable.css'

interface UsageHistoryTableProps {
  startDate?: string | null
  endDate?: string | null
  model?: string | null
}

export function UsageHistoryTable({
  startDate,
  endDate,
  model,
}: UsageHistoryTableProps) {
  const [records, setRecords] = useState<LLMUsageRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const pageSize = 50

  const loadHistory = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await getUsageHistory(startDate, endDate, model, page, pageSize)
      setRecords(response.records)
      setTotal(response.total)
      setTotalPages(response.total_pages)
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, model, page])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('fr-FR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Coût d'un appel, en dollars : six décimales fixes, un appel coûte souvent moins d'un centime.
  const formatCallCost = (cost: number) =>
    formatCurrency(cost, 'USD', { minimumFractionDigits: 6, maximumFractionDigits: 6 })

  if (loading) {
    return <div className="usage-history-loading">Chargement...</div>
  }

  if (error) {
    return <div className="usage-history-error">Erreur: {error}</div>
  }

  return (
    <div className="usage-history-table">
      <div className="usage-history-table__header">
        <h3>Historique des appels LLM</h3>
        <div className="usage-history-table__pagination-info">
          Page {page} sur {totalPages} ({formatNumber(total)} enregistrements)
        </div>
      </div>

      {records.length === 0 ? (
        <div className="usage-history-empty">
          Aucun appel sur cette période. Chaque génération s&apos;inscrira ici avec son coût et sa durée.
        </div>
      ) : (
        <>
          <div className="usage-history-table__scroll">
            <table className="usage-history-table__table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Modèle</th>
                  <th>Endpoint</th>
                  <th className="num-cell">Tokens</th>
                  <th className="num-cell">Coût</th>
                  <th className="num-cell">Durée</th>
                  <th className="num-cell">Variantes</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.request_id} className={record.success ? '' : 'error-row'}>
                    <td className="date-cell">{formatDate(record.timestamp)}</td>
                    <td className="model-cell">{record.model_name}</td>
                    <td className="endpoint-cell">{record.endpoint}</td>
                    <td className="num-cell">{formatNumber(record.total_tokens)}</td>
                    <td className="num-cell">{formatCallCost(record.estimated_cost)}</td>
                    <td className="num-cell">{formatDurationMs(record.duration_ms, 2)}</td>
                    <td className="num-cell">{record.k_variants}</td>
                    <td>
                      <span className={`status-badge ${record.success ? 'success' : 'error'}`}>
                        {record.success ? 'Succès' : 'Échec'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="usage-history-table__pagination">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="pagination-button"
            >
              Précédent
            </button>
            <span className="pagination-page">
              Page {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="pagination-button"
            >
              Suivant
            </button>
          </div>
        </>
      )}
    </div>
  )
}
