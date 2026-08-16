/**
 * Mapping Template → Preset synthétique pour réutiliser applyPreset / preparePresetForApply.
 */
import type { Preset } from '../types/preset'
import type { Template } from '../types/template'

export type LlmProviderId = 'openai' | 'mistral' | 'openrouter'

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
 * Narrow le fournisseur snapshoté d'un template vers les IDs llmStore.
 *
 * @param value - Valeur persistée (peut être absente)
 * @returns True si openai / mistral / openrouter
 */
export function isLlmProvider(value: string | null | undefined): value is LlmProviderId {
  return value === 'openai' || value === 'mistral' || value === 'openrouter'
}
