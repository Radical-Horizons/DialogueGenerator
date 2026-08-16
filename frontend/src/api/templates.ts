/**
 * Client API pour les templates custom de génération (Bearer + cookies via apiClient).
 */
import apiClient from './client'
import type {
  MarketplaceListing,
  MarketplaceRatingRequest,
  PrebuiltTemplate,
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

/**
 * Liste les templates pré-built Alteir.
 *
 * @returns Catalogue lecture seule
 */
export async function listPrebuiltTemplatesApi(): Promise<PrebuiltTemplate[]> {
  const { data } = await apiClient.get<PrebuiltTemplate[]>('/api/v1/templates/prebuilt')
  return data
}

/**
 * Charge une fiche pré-built par slug.
 *
 * @param slug - Identifiant kebab-case
 */
export async function getPrebuiltTemplateApi(slug: string): Promise<PrebuiltTemplate> {
  const { data } = await apiClient.get<PrebuiltTemplate>(`/api/v1/templates/prebuilt/${slug}`)
  return data
}

/**
 * Liste les fiches marketplace.
 */
export async function listMarketplaceTemplatesApi(): Promise<MarketplaceListing[]> {
  const { data } = await apiClient.get<MarketplaceListing[]>('/api/v1/templates/marketplace')
  return data
}

/**
 * Publie un template custom vers le marketplace.
 */
export async function publishMarketplaceTemplateApi(
  templateId: string,
): Promise<MarketplaceListing> {
  const { data } = await apiClient.post<MarketplaceListing>('/api/v1/templates/marketplace', {
    templateId,
  })
  return data
}

/**
 * Copie une fiche marketplace vers Mes templates.
 */
export async function copyMarketplaceListingApi(
  listingId: string,
): Promise<TemplateWriteResponse> {
  const { data } = await apiClient.post<TemplateWriteResponse>(
    `/api/v1/templates/marketplace/${listingId}/use`,
  )
  return data
}

/**
 * Note une fiche marketplace (1–5).
 */
export async function rateMarketplaceTemplateApi(
  listingId: string,
  body: MarketplaceRatingRequest,
): Promise<MarketplaceListing> {
  const { data } = await apiClient.put<MarketplaceListing>(
    `/api/v1/templates/marketplace/${listingId}/rating`,
    body,
  )
  return data
}

/**
 * Retire une fiche marketplace (auteur ou admin).
 */
export async function unpublishMarketplaceListingApi(listingId: string): Promise<void> {
  await apiClient.delete(`/api/v1/templates/marketplace/${listingId}`)
}
