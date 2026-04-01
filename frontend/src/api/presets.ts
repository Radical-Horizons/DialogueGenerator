/**
 * Client API pour les presets de génération (Bearer + cookies via apiClient).
 */
import apiClient from './client'
import type { Preset, PresetCreate, PresetUpdate, PresetValidationResult } from '../types/preset'

/** Résultat de création : preset persisté + message optionnel d’auto-nettoyage (header serveur). */
export interface PresetCreateResult {
  preset: Preset
  cleanupMessage: string | null
}

function extractCleanupMessage(headers: Record<string, unknown>): string | null {
  const h = headers as Record<string, string | undefined>
  const raw = h['x-preset-cleanup-message'] ?? h['X-Preset-Cleanup-Message']
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}

/**
 * Liste tous les presets.
 *
 * @returns Tableau de presets
 */
export async function listPresetsApi(): Promise<Preset[]> {
  const { data } = await apiClient.get<Preset[]>('/api/v1/presets')
  return data
}

/**
 * Charge un preset par identifiant.
 *
 * @param id - UUID du preset
 * @returns Preset
 */
export async function getPresetApi(id: string): Promise<Preset> {
  const { data } = await apiClient.get<Preset>(`/api/v1/presets/${id}`)
  return data
}

/**
 * Crée un preset.
 *
 * @param body - Données de création
 * @returns Preset créé et message de cleanup éventuel
 */
export async function createPresetApi(body: PresetCreate): Promise<PresetCreateResult> {
  const response = await apiClient.post<Preset>('/api/v1/presets', body)
  return {
    preset: response.data,
    cleanupMessage: extractCleanupMessage(response.headers as Record<string, unknown>),
  }
}

/**
 * Met à jour un preset.
 *
 * @param id - UUID du preset
 * @param body - Champs à mettre à jour
 * @returns Preset mis à jour
 */
export async function updatePresetApi(id: string, body: PresetUpdate): Promise<Preset> {
  const { data } = await apiClient.put<Preset>(`/api/v1/presets/${id}`, body)
  return data
}

/**
 * Supprime un preset.
 *
 * @param id - UUID du preset
 */
export async function deletePresetApi(id: string): Promise<void> {
  await apiClient.delete(`/api/v1/presets/${id}`)
}

/**
 * Valide les références GDD d’un preset.
 *
 * @param id - UUID du preset
 * @returns Résultat de validation
 */
export async function validatePresetApi(id: string): Promise<PresetValidationResult> {
  const { data } = await apiClient.get<PresetValidationResult>(
    `/api/v1/presets/${id}/validate`
  )
  return data
}
