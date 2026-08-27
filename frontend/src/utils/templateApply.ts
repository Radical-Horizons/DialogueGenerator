/**
 * Mapping Template → Preset synthétique pour réutiliser applyPreset / preparePresetForApply.
 */
import type { Preset } from '../types/preset'
import type { PrebuiltTemplate, Template } from '../types/template'

export type LlmProviderId = 'openai' | 'mistral' | 'openrouter'

export const PREBUILT_NEW_BADGE_DAYS = 30
const PREBUILT_APPLY_ID = '00000000-0000-4000-8000-000000000000'

/**
 * Construit un Preset depuis un template (sans llmProvider / temperature).
 *
 * @param template - Template custom
 * @returns Preset applicable via preparePresetForApply
 */
export function templateToPreset(template: Template): Preset {
  const configuration = { ...template.configuration }
  delete configuration.llmProvider
  delete configuration.temperature
  return {
    id: template.id,
    name: template.name,
    icon: template.icon,
    metadata: template.metadata,
    configuration,
  }
}

/**
 * Mappe une fiche pré-built vers un Template synthétique (apply 6.3).
 *
 * @param prebuilt - Fiche catalogue
 * @returns Template applicable via applyTemplateSnapshot
 */
export function prebuiltToTemplate(prebuilt: PrebuiltTemplate): Template {
  return {
    id: PREBUILT_APPLY_ID,
    name: prebuilt.name,
    description: prebuilt.description,
    category: prebuilt.category,
    icon: prebuilt.icon,
    metadata: { created: prebuilt.addedAt, modified: prebuilt.addedAt },
    configuration: prebuilt.configuration,
  }
}

/**
 * Badge « Nouveau » si addedAt a moins de 30 jours.
 *
 * @param addedAt - ISO 8601
 * @param nowMs - Horodatage de référence
 */
export function isPrebuiltNew(addedAt: string, nowMs: number = Date.now()): boolean {
  const added = Date.parse(addedAt)
  if (Number.isNaN(added)) {
    return false
  }
  return nowMs - added < PREBUILT_NEW_BADGE_DAYS * 24 * 60 * 60 * 1000
}

/**
 * Narrow le fournisseur snapshoté d'un template vers les IDs llmStore.
 *
 * @param value - Valeur persistée (peut être absente)
 * @returns True si openai / mistral / openrouter
 */
export function isLlmProvider(value: string | null | undefined): value is LlmProviderId {
  return value === 'openai' || value === 'mistral' || value === 'openrouter'
}
