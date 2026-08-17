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

export type TemplateHistoryAction = 'created' | 'updated' | 'restored'

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
  ownerId?: string | null
  visibility?: 'owned' | 'shared' | 'legacy' | null
  ownerUsername?: string | null
  sharedByUsername?: string | null
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

/** Partage d'équipe (pointeur live). */
export interface TemplateShare {
  template_id: string
  user_id: string
  username: string
  created_at: string
  can_edit?: boolean
}

export interface TemplateShareTarget {
  id: string
  username: string
}

export interface TemplateVersionSummary {
  id: string
  at: string
  name: string
  instructionsPreview: string
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
  isAnonymous?: boolean
  isOfficial?: boolean
}

export interface MarketplaceRatingRequest {
  stars: number
}

export type ABTestThumb = 'up' | 'down' | null

export interface ABTestCriterionScore {
  criterionId: string
  label: string
  score: number
}

export interface ABTestGeneration {
  id: string
  templateId: string
  templateName: string
  index: number
  overallScore: number | null
  criteria: ABTestCriterionScore[]
  costEur: number
  durationMs: number
  thumb: ABTestThumb
  error: string | null
  document?: unknown | null
}

export interface ABTestSideTotals {
  meanOverall: number | null
  scoredCount: number
  totalCostEur: number
  totalDurationMs: number
  thumbsUp: number
  thumbsDown: number
}

export interface ABTestResult {
  testId: string
  status: 'queued' | 'running' | 'completed' | 'failed' | string
  current: number
  total: number
  createdAt: string
  templateAId: string
  templateBId: string
  templateAName: string
  templateBName: string
  generationsPerTemplate: number
  maxDepth: number
  parentTestId: string | null
  winnerTemplateId: string | null
  scoreVarianceNote: string
  generations: ABTestGeneration[]
  totals: {
    templateA: ABTestSideTotals
    templateB: ABTestSideTotals
  }
  error: string | null
}

export interface ABTestHistoryItem {
  testId: string
  status: string
  createdAt: string
  templateAId: string
  templateBId: string
  templateAName: string
  templateBName: string
  winnerTemplateId: string | null
  parentTestId: string | null
  meanScoreA: number | null
  meanScoreB: number | null
}

export type ABTestWinnerMode = 'score' | 'score_thumbs' | 'score_cost'

export interface ABTestCreateRequest {
  templateAId: string
  templateBId: string
  generationsPerTemplate: number
  maxDepth?: number
  winnerMode?: ABTestWinnerMode
}

export interface ABTestCreateResponse {
  testId: string
  status: string
  current: number
  total: number
}

export interface MarketplaceComment {
  id: string
  listingId: string
  authorUsername: string
  body: string
  createdAt: string
}

export type TemplateSuggestionSource = 'custom' | 'prebuilt' | 'marketplace'

export interface TemplateSuggestionRequest {
  instructions: string
  sceneType: string
  characters: string[]
  locations: string[]
  rencontreInitialeByCharacter: Record<string, string>
}

export interface TemplateSuggestion {
  source: TemplateSuggestionSource
  id: string
  name: string
  description: string
  category: string
  icon: string
  score: number
  reasons: string[]
  configuration: TemplateConfiguration
  visibility?: 'owned' | 'shared' | 'legacy' | null
  sceneTypeHint?: string | null
  gddSystem?: string | null
  objectif?: string | null
  casUsage?: string | null
  examples?: string[] | null
  addedAt?: string | null
}

export interface TemplateSuggestionUsedResponse {
  source: TemplateSuggestionSource
  id: string
  useCount: number
}
