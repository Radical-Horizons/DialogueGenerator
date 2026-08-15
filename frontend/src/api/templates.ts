/**
 * Client API pour les templates custom de génération (Bearer + cookies via apiClient).
 */
import apiClient from './client'
import type { Template, TemplateCreate, TemplateCreateResponse } from '../types/template'

/**
 * Liste tous les templates custom.
 *
 * @returns Tableau de templates
 */
export async function listTemplatesApi(): Promise<Template[]> {
  const { data } = await apiClient.get<Template[]>('/api/v1/templates')
  return data
}

/**
 * Crée un template custom.
 *
 * @param body - Données de création (métadonnées + snapshot de configuration)
 * @returns Template créé et warnings GDD
 */
export async function createTemplateApi(body: TemplateCreate): Promise<TemplateCreateResponse> {
  const { data } = await apiClient.post<TemplateCreateResponse>('/api/v1/templates', body)
  return data
}
