/**
 * Client API pour les templates custom de génération (Bearer + cookies via apiClient).
 */
import apiClient from './client'
import type {
  ABTestCreateRequest,
  ABTestCreateResponse,
  ABTestHistoryItem,
  ABTestResult,
  MarketplaceListing,
  MarketplaceRatingRequest,
  PrebuiltTemplate,
  Template,
  TemplateCreate,
  TemplateShare,
  TemplateSuggestion,
  TemplateSuggestionRequest,
  TemplateSuggestionUsedResponse,
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
 * Liste les destinataires d'un template (owner/admin).
 */
export async function listTemplateSharesApi(templateId: string): Promise<TemplateShare[]> {
  const { data } = await apiClient.get<TemplateShare[]>(
    `/api/v1/templates/${templateId}/shares`,
  )
  return data
}

/**
 * Invite un writer par username.
 */
export async function createTemplateShareApi(
  templateId: string,
  username: string,
): Promise<TemplateShare> {
  const { data } = await apiClient.post<TemplateShare>(
    `/api/v1/templates/${templateId}/shares`,
    { username },
  )
  return data
}

/**
 * Révoque un destinataire.
 */
export async function deleteTemplateShareApi(
  templateId: string,
  userId: string,
): Promise<void> {
  await apiClient.delete(`/api/v1/templates/${templateId}/shares/${userId}`)
}

/**
 * Clone un template visible en custom owned.
 */
export async function copyTemplateApi(templateId: string): Promise<TemplateWriteResponse> {
  const { data } = await apiClient.post<TemplateWriteResponse>(
    `/api/v1/templates/${templateId}/copy`,
  )
  return data
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

/**
 * Lance un test A/B (job 202).
 */
export async function startAbTestApi(body: ABTestCreateRequest): Promise<ABTestCreateResponse> {
  const { data } = await apiClient.post<ABTestCreateResponse>('/api/v1/templates/ab-test', body)
  return data
}

/**
 * Liste l'historique des tests A/B.
 */
export async function listAbTestsApi(): Promise<ABTestHistoryItem[]> {
  const { data } = await apiClient.get<ABTestHistoryItem[]>('/api/v1/templates/ab-test')
  return data
}

/**
 * Charge un test A/B (statut + résultats).
 */
export async function getAbTestApi(testId: string): Promise<ABTestResult> {
  const { data } = await apiClient.get<ABTestResult>(`/api/v1/templates/ab-test/${testId}`)
  return data
}

/**
 * Enregistre un pouce sur une génération.
 */
export async function patchAbTestFeedbackApi(
  testId: string,
  body: { generationId: string; thumb: 'up' | 'down' | 'none' },
): Promise<ABTestResult> {
  const { data } = await apiClient.patch<ABTestResult>(
    `/api/v1/templates/ab-test/${testId}/feedback`,
    body,
  )
  return data
}

/**
 * Relance un test (nouveau run lié au parent).
 */
export async function rerunAbTestApi(testId: string): Promise<ABTestCreateResponse> {
  const { data } = await apiClient.post<ABTestCreateResponse>(
    `/api/v1/templates/ab-test/${testId}/rerun`,
  )
  return data
}

/**
 * Classe les templates lisibles selon le scénario (déterministe).
 */
export async function suggestTemplatesApi(
  body: TemplateSuggestionRequest,
): Promise<TemplateSuggestion[]> {
  const { data } = await apiClient.post<TemplateSuggestion[]>(
    '/api/v1/templates/suggestions',
    body,
  )
  return data
}

/**
 * Incrémente le compteur perso après un Charger réussi.
 */
export async function recordSuggestionUsedApi(
  source: TemplateSuggestion['source'],
  id: string,
): Promise<TemplateSuggestionUsedResponse> {
  const { data } = await apiClient.post<TemplateSuggestionUsedResponse>(
    '/api/v1/templates/suggestions/used',
    { source, id },
  )
  return data
}
