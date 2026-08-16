/**
 * Types TypeScript pour les templates custom de génération (alignés sur api/schemas/template.py).
 */

import type { ContextDroppingRules } from './graph'
import type { PresetConfiguration, PresetMetadata } from './preset'

/** Configuration snapshotée : PresetConfiguration + champs LLM optionnels. */
export interface TemplateConfiguration extends PresetConfiguration {
  llmProvider?: string | null
  temperature?: number | null
  contextDroppingRules?: ContextDroppingRules | null
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

/** Réponse POST 201 / PUT 200 : template persisté + warnings GDD. */
export interface TemplateWriteResponse extends Template {
  warnings: string[]
}

/** Alias historique (création). */
export type TemplateCreateResponse = TemplateWriteResponse

export interface TemplateUpdate {
  name?: string
  description?: string
  category?: string
  icon?: string
  configuration?: TemplateConfiguration
}

/** Fiche Alteir lecture seule (catalogue pré-built). */
export interface PrebuiltTemplate {
  id: string
  name: string
  description: string
  category: string
  icon: string
  gddSystem: string
  sceneTypeHint: string
  objectif: string
  casUsage: string
  examples: string[]
  addedAt: string
  configuration: TemplateConfiguration
}

/** Fiche marketplace (snapshot publié + notes / usages). */
export interface MarketplaceListing {
  id: string
  sourceTemplateId: string
  authorId: string
  authorUsername: string
  name: string
  description: string
  category: string
  icon: string
  configuration: TemplateConfiguration
  createdAt: string
  usageCount: number
  ratingAverage: number | null
  ratingCount: number
}

export interface MarketplaceRatingRequest {
  stars: number
}
