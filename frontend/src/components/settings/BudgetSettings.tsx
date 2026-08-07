/**
 * Composant pour configurer le budget LLM.
 * La persistance passe par `apply()` (bouton Appliquer du modal parent), pas un bouton local.
 */
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { getBudget, updateBudget, type BudgetResponse } from '../../api/costs'
import { getErrorMessage } from '../../types/errors'
import {
  redesignControl,
  redesignFont,
  redesignHairline,
  redesignMonoLabelStyle,
  redesignRadius,
  redesignSpacing,
  redesignSurface,
  redesignText,
} from '../../theme/redesignTokens'

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
      return <div style={{ color: redesignText.label }}>Chargement du budget…</div>
    }

    return (
      <div>
        <h3
          style={{
            marginTop: 0,
            marginBottom: redesignSpacing.md,
            fontFamily: redesignFont.serif,
            fontWeight: 400,
            color: redesignText.strong,
          }}
        >
          Budget LLM
        </h3>

        {error && (
          <div style={{
            padding: redesignSpacing.sm,
            marginBottom: redesignSpacing.md,
            backgroundColor: 'rgba(255, 68, 68, 0.08)',
            border: '1px solid rgba(255, 68, 68, 0.4)',
            borderRadius: redesignRadius.control,
            color: '#ff8a8a',
          }}>
            Erreur : {error}
          </div>
        )}

        {budget && (
          <>
            {/* Filets + valeurs mono : aucun chiffre en sans-serif (invariant refonte). */}
            <dl
              style={{
                margin: 0,
                marginBottom: redesignSpacing.lg,
                borderTop: `1px solid ${redesignHairline.standard}`,
              }}
            >
              {[
                { label: 'Budget mensuel', value: formatCost(budget.quota) },
                {
                  label: 'Dépensé',
                  value: `${formatCost(budget.amount)} · ${budget.percentage.toFixed(1)} %`,
                },
                { label: 'Restant', value: formatCost(budget.remaining) },
              ].map((row) => (
                <div
                  key={row.label}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: redesignSpacing.md,
                    padding: `${redesignSpacing.sm}px 0`,
                    borderBottom: `1px solid ${redesignHairline.standard}`,
                  }}
                >
                  <dt style={{ ...redesignMonoLabelStyle, fontSize: '10px', color: redesignText.label }}>
                    {row.label}
                  </dt>
                  <dd
                    style={{
                      margin: 0,
                      fontFamily: redesignFont.mono,
                      fontSize: '12px',
                      color: redesignText.strong,
                    }}
                  >
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>

            <div style={{ marginBottom: redesignSpacing.lg }}>
              <label
                htmlFor="quota"
                style={{
                  display: 'block',
                  marginBottom: redesignSpacing.sm,
                  ...redesignMonoLabelStyle,
                  fontSize: '10px',
                  color: redesignText.label,
                }}
              >
                Quota mensuel (USD)
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
                  padding: `${redesignSpacing.sm}px ${redesignSpacing.md}px`,
                  fontFamily: redesignFont.mono,
                  fontSize: '13px',
                  border: `1px solid ${redesignControl.border}`,
                  borderRadius: redesignRadius.control,
                  backgroundColor: redesignSurface.base,
                  color: redesignText.strong,
                  boxSizing: 'border-box',
                }}
              />
              <div style={{
                marginTop: redesignSpacing.xs,
                fontSize: '12px',
                color: redesignText.muted,
              }}>
                Plafond mensuel des appels LLM.
              </div>
            </div>
          </>
        )}
      </div>
    )
  }
)
