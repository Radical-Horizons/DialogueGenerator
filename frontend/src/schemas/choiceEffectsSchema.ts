/**
 * Schéma Zod pour choiceEffects (Story 9.3).
 */
import { z } from 'zod'

const counterAdjustOperatorSchema = z.enum(['=', '+=', '-='])

export const setBoolEffectSchema = z.object({
  kind: z.literal('set_bool'),
  flagId: z.string().min(1),
  value: z.boolean(),
})

export const adjustCounterEffectSchema = z.object({
  kind: z.literal('adjust_counter'),
  flagId: z.string().min(1),
  operator: counterAdjustOperatorSchema,
  value: z.number(),
})

export const setEnumEffectSchema = z.object({
  kind: z.literal('set_enum'),
  flagId: z.string().min(1),
  value: z.string().min(1),
})

export const reputationDeltaEffectSchema = z.object({
  kind: z.literal('reputation_delta'),
  axisId: z.string().min(1),
  factionId: z.string().min(1),
  delta: z.number(),
})

export const choiceEffectAtomSchema = z.discriminatedUnion('kind', [
  setBoolEffectSchema,
  adjustCounterEffectSchema,
  setEnumEffectSchema,
  reputationDeltaEffectSchema,
])

export const choiceEffectsListSchema = z.array(choiceEffectAtomSchema)

/**
 * Effets réellement éditables dans le formulaire de nœud.
 *
 * Sous-ensemble de `ChoiceEffect` (`types/choiceEffects.ts`) : ce dernier porte en plus
 * `reputation_delta_fr94`, consommé à l'exécution (simulation, preview) mais que ni ce
 * schéma ni l'éditeur ne savent produire.
 */
export type ChoiceEffectAtom = z.infer<typeof choiceEffectAtomSchema>
