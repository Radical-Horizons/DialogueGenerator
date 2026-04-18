/**
 * Schéma Zod pour la validation des données de nœud de dialogue.
 */
import { z } from 'zod'

import { choiceEffectsListSchema } from './choiceEffectsSchema'
import { visibilityConditionsBlockSchema } from './visibilityConditionsSchema'

/**
 * Schéma pour un trait requirement.
 */
export const traitRequirementSchema = z.object({
  trait: z.string().min(1, 'Le nom du trait est requis'),
  minValue: z.number().int().min(0, 'La valeur minimale doit être >= 0'),
})

/**
 * Schéma pour un choix de dialogue.
 */
export const choiceSchema = z.object({
  choiceId: z.string().optional(), // ADR-008 / v1.1.0 : identité stable pour handles et edges
  text: z.string().min(1, 'Le texte du choix est requis'),
  targetNode: z.string().optional(),
  condition: z.string().optional(),
  visibilityConditions: visibilityConditionsBlockSchema.optional(),
  choiceEffects: choiceEffectsListSchema.optional(),
  traitRequirements: z.array(traitRequirementSchema).optional(),
  test: z.string().optional(),
  testCriticalFailureNode: z.string().optional(),
  testFailureNode: z.string().optional(),
  testSuccessNode: z.string().optional(),
  testCriticalSuccessNode: z.string().optional(),
  allowInfluenceForcing: z.boolean().optional(),
  influenceThreshold: z.number().int().optional(),
  influenceDelta: z.number().int().optional(),
  respectDelta: z.number().int().optional(),
})

/**
 * Schéma pour une entrée d'historique de régénération (Story 1.10).
 */
export const regenerationEntrySchema = z.object({
  timestamp: z.string(),
  instructions: z.string(),
  generationId: z.string(),
  cost: z.number().optional(),
  provider: z.string().optional(),
})

/**
 * Schéma pour les données d'un nœud de dialogue.
 */
export const dialogueNodeDataSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  speaker: z.string().optional(),
  line: z.string().optional(),
  visibilityConditions: visibilityConditionsBlockSchema.optional(),
  choices: z.array(choiceSchema).optional(),
  nextNode: z.string().optional(),
  lastGenerationInstructions: z.string().optional(),
  regenerationHistory: z.array(regenerationEntrySchema).optional(),
  contextGddHash: z.string().optional(),
  contextGddContentFingerprint: z.string().optional(),
  gddContextSelectionsSnapshot: z.record(z.string(), z.unknown()).optional(),
})

/**
 * Schéma pour les données d'un nœud de test.
 */
export const testNodeDataSchema = z.object({
  id: z.string(),
  test: z.string().min(1, 'Le test d\'attribut est requis (format: Attribut+Compétence:DD)'),
  line: z.string().optional(),
  criticalFailureNode: z.string().optional(),
  failureNode: z.string().optional(),
  successNode: z.string().optional(),
  criticalSuccessNode: z.string().optional(),
})

/**
 * Schéma pour les données d'un nœud de fin.
 */
export const endNodeDataSchema = z.object({
  id: z.string(),
})

/**
 * Type inféré pour une entrée d'historique de régénération.
 */
export type RegenerationEntry = z.infer<typeof regenerationEntrySchema>

/**
 * Type inféré pour un choix.
 */
export type Choice = z.infer<typeof choiceSchema>

/**
 * Type inféré pour les données d'un nœud de dialogue.
 */
export type DialogueNodeData = z.infer<typeof dialogueNodeDataSchema>

/**
 * Type inféré pour les données d'un nœud de test.
 */
export type TestNodeData = z.infer<typeof testNodeDataSchema>

/**
 * Type inféré pour les données d'un nœud de fin.
 */
export type EndNodeData = z.infer<typeof endNodeDataSchema>
