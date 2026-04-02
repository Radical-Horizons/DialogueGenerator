/**
 * Client API pour les endpoints de cost governance.
 */
import apiClient from './client'
import type { BudgetResponse, UsageResponse } from '../types/costs'

export type {
  BudgetResponse,
  UpdateBudgetRequest,
  DailyCost,
  UsageResponse,
} from '../types/costs'

/**
 * Récupère le budget actuel.
 */
export async function getBudget(): Promise<BudgetResponse> {
  const response = await apiClient.get('/api/v1/costs/budget')
  return response.data
}

/**
 * Met à jour le quota budget.
 */
export async function updateBudget(quota: number): Promise<BudgetResponse> {
  const response = await apiClient.put('/api/v1/costs/budget', { quota })
  return response.data
}

/**
 * Récupère l'usage avec graphique (coûts quotidiens).
 */
export async function getUsage(): Promise<UsageResponse> {
  const response = await apiClient.get('/api/v1/costs/usage')
  return response.data
}
