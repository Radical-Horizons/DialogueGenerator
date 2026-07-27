/**
 * Composant pour configurer le budget LLM.
 * La persistance passe par `apply()` (bouton Appliquer du modal parent), pas un bouton local.
 */
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { getBudget, updateBudget, type BudgetResponse } from '../../api/costs'
import { getErrorMessage } from '../../types/errors'

export interface BudgetSettingsHandle {
  /** Valide et persiste le quota draft. Retourne false si validation/API échoue. */
  apply: () => Promise<boolean>
}

interface BudgetSettingsProps {
  onBudgetUpdated?: (budget: BudgetResponse) => void
}

export const BudgetSettings = forwardRef<BudgetSettingsHandle, BudgetSettingsProps>(
  function BudgetSettings({ onBudgetUpdated }, ref) {
    const [budget, setBudget] = useState<BudgetResponse | null>(null)
    const [quota, setQuota] = useState<string>('')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
      void loadBudget()
    }, [])

    const loadBudget = async () => {
      setLoading(true)
      setError(null)
      try {
        const budgetData = await getBudget()
        setBudget(budgetData)
        setQuota(budgetData.quota.toString())
      } catch (err: unknown) {
        setError(getErrorMessage(err))
      } finally {
        setLoading(false)
      }
    }

    const validateQuota = (quotaValue: number): string | null => {
      if (isNaN(quotaValue) || !isFinite(quotaValue)) {
        return 'Le quota doit être un nombre valide'
      }
      if (quotaValue < 0) {
        return 'Le quota doit être un nombre positif ou zéro'
      }
      const MIN_QUOTA = 0.01
      if (quotaValue > 0 && quotaValue < MIN_QUOTA) {
        return `Le quota minimum est ${MIN_QUOTA.toFixed(2)} USD (1 centime)`
      }
      const MAX_QUOTA = 10000.0
      if (quotaValue > MAX_QUOTA) {
        return `Le quota maximum est ${MAX_QUOTA.toFixed(2)} USD par mois. Contactez l'administrateur pour un quota supérieur.`
      }
      return null
    }

    useImperativeHandle(
      ref,
      () => ({
        apply: async () => {
          if (!budget) {
            return true
          }

          const quotaValue = parseFloat(quota)
          const validationError = validateQuota(quotaValue)
          if (validationError) {
            setError(validationError)
            return false
          }

          if (quotaValue === budget.quota) {
            setError(null)
            return true
          }

          setError(null)
          try {
            const updatedBudget = await updateBudget(quotaValue)
            setBudget(updatedBudget)
            setQuota(updatedBudget.quota.toString())
            onBudgetUpdated?.(updatedBudget)
            return true
          } catch (err: unknown) {
            setError(getErrorMessage(err))
            return false
          }
        },
      }),
      [budget, quota, onBudgetUpdated]
    )

    const formatCost = (cost: number) => {
      if (cost < 0.01) return `$${cost.toFixed(6)}`
      return `$${cost.toFixed(2)}`
    }

    if (loading) {
      return <div style={{ padding: '1rem', color: 'rgba(255, 255, 255, 0.75)' }}>Chargement du budget...</div>
    }

    return (
      <div style={{ padding: '1.5rem' }}>
        <h2 style={{ marginTop: 0, marginBottom: '1.5rem', color: 'rgba(255, 255, 255, 0.95)' }}>
          Configuration du Budget LLM
        </h2>

        {error && (
          <div style={{
            padding: '0.75rem',
            marginBottom: '1rem',
            backgroundColor: '#3a1a1a',
            border: '1px solid #ff4444',
            borderRadius: '4px',
            color: '#ff6b6b'
          }}>
            Erreur: {error}
          </div>
        )}

        {budget && (
          <>
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{
                padding: '1rem',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '4px',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Budget actuel:</strong> {formatCost(budget.quota)}
                </div>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Montant dépensé:</strong> {formatCost(budget.amount)} ({budget.percentage.toFixed(1)}%)
                </div>
                <div>
                  <strong>Montant restant:</strong> {formatCost(budget.remaining)}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label htmlFor="quota" style={{
                display: 'block',
                marginBottom: '0.5rem',
                color: 'rgba(255, 255, 255, 0.87)',
                fontWeight: 500
              }}>
                Quota mensuel (USD):
              </label>
              <input
                id="quota"
                type="number"
                min="0"
                step="0.01"
                value={quota}
                onChange={(e) => setQuota(e.target.value)}
                placeholder="100.00"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  fontSize: '1rem',
                  border: '1px solid #404040',
                  borderRadius: '4px',
                  backgroundColor: '#2a2a2a',
                  color: 'rgba(255, 255, 255, 0.87)',
                  boxSizing: 'border-box'
                }}
              />
              <div style={{
                marginTop: '0.25rem',
                fontSize: '0.875rem',
                color: 'rgba(255, 255, 255, 0.6)'
              }}>
                Définissez votre budget mensuel maximum pour les appels LLM.
              </div>
            </div>
          </>
        )}
      </div>
    )
  }
)
