import apiClient from './client'
import type { GameSystemsIntegrationCatalog } from '../types/gameSystemsIntegration'

export async function getGameSystemsIntegrationCatalog(): Promise<GameSystemsIntegrationCatalog> {
  const response = await apiClient.get<GameSystemsIntegrationCatalog>(
    '/api/v1/mechanics/systems/integration',
  )
  return response.data
}
