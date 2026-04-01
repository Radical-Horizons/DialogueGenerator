/** Types partagés pour les endpoints `/api/v1/costs/*`. */

export interface BudgetResponse {
  quota: number
  amount: number
  percentage: number
  remaining: number
}

export interface UpdateBudgetRequest {
  quota: number
}

export interface DailyCost {
  date: string
  cost: number
}

export interface UsageResponse {
  daily_costs: DailyCost[]
  total: number
  percentage: number
}
