/**
 * Schéma Zod pour la validation des données de nœud de dialogue.
 */
import { z } from 'zod'

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
 * Schéma pour les données d'un nœud de dialogue.
 */
export const dialogueNodeDataSchema = z.object({
  id: z.string(),
  speaker: z.string().optional(),
  line: z.string().optional(),
  choices: z.array(choiceSchema).optional(),
  nextNode: z.string().optional(),
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
