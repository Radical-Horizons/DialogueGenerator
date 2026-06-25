import apiClient from './client'
import type { SkillCheckCatalog } from '../types/skillCheckCatalog'

export async function getSkillCheckCatalog(): Promise<SkillCheckCatalog> {
  const response = await apiClient.get<SkillCheckCatalog>(
    '/api/v1/mechanics/systems/skill-check-catalog',
  )
  return response.data
}
