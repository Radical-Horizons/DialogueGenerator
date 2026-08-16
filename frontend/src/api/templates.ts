/**
 * Client API pour les templates custom de génération (Bearer + cookies via apiClient).
 */
import apiClient from './client'
import type {
  Template,
  TemplateCreate,
  TemplateUpdate,
  TemplateWriteResponse,
} from '../types/template'
import type { PresetValidationResult } from '../types/preset'

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
 * Charge un template par UUID.
 *
 * @param id - UUID
 * @returns Template
 */
export async function getTemplateApi(id: string): Promise<Template> {
  const { data } = await apiClient.get<Template>(`/api/v1/templates/${id}`)
  return data
}

/**
 * Crée un template custom.
 *
 * @param body - Données de création (métadonnées + snapshot de configuration)
 * @returns Template créé et warnings GDD
 */
export async function createTemplateApi(body: TemplateCreate): Promise<TemplateWriteResponse> {
  const { data } = await apiClient.post<TemplateWriteResponse>('/api/v1/templates', body)
  return data
}

/**
 * Met à jour un template (même UUID).
 *
 * @param id - UUID
 * @param body - Champs partiels
 * @returns Template persisté et warnings GDD
 */
export async function updateTemplateApi(
  id: string,
  body: TemplateUpdate,
): Promise<TemplateWriteResponse> {
  const { data } = await apiClient.put<TemplateWriteResponse>(`/api/v1/templates/${id}`, body)
  return data
}

/**
 * Supprime un template.
 *
 * @param id - UUID
 */
export async function deleteTemplateApi(id: string): Promise<void> {
  await apiClient.delete(`/api/v1/templates/${id}`)
}

/**
 * Valide les références GDD d’un template (sans muter le JSON).
 *
 * @param id - UUID du template
 * @returns Résultat de validation
 */
export async function validateTemplateApi(id: string): Promise<PresetValidationResult> {
  const { data } = await apiClient.get<PresetValidationResult>(
    `/api/v1/templates/${id}/validate`,
  )
  return data
}
