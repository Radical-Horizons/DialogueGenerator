/**
 * Types TypeScript pour les templates custom de génération (alignés sur api/schemas/template.py).
 */

import type { PresetConfiguration, PresetMetadata } from './preset'

/** Configuration snapshotée : PresetConfiguration + champs LLM optionnels. */
export interface TemplateConfiguration extends PresetConfiguration {
  llmProvider?: string | null
  temperature?: number | null
}

export type TemplateHistoryAction = 'created' | 'updated'

export interface TemplateHistoryEntry {
  at: string
  action: TemplateHistoryAction
}

export interface Template {
  id: string
  name: string
  description: string
  category: string
  icon: string
  metadata: PresetMetadata
  configuration: TemplateConfiguration
  history?: TemplateHistoryEntry[]
}

export interface TemplateCreate {
  name: string
  description?: string
  category?: string
  icon?: string
  configuration: TemplateConfiguration
}

/** Réponse POST 201 : template persisté + warnings GDD. */
export interface TemplateCreateResponse extends Template {
  warnings: string[]
}
