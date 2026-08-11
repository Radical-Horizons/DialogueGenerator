/**
 * Zod — conditions de visibilité (Story 9.2), aligné schéma JSON / Pydantic backend.
 */
import { z } from 'zod'

const comparisonOperatorSchema = z.enum(['=', '!=', '>=', '<=', '>', '<'])

export const conditionAtomSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('flag_bool'),
    flagId: z.string().min(1),
    equals: z.boolean(),
  }),
  z.object({
    kind: z.literal('flag_counter'),
    flagId: z.string().min(1),
    operator: comparisonOperatorSchema,
    value: z.number(),
  }),
  z.object({
    kind: z.literal('flag_enum'),
    flagId: z.string().min(1),
    operator: z.enum(['=', '!=']),
    value: z.string().min(1),
  }),
  z.object({
    kind: z.literal('reputation'),
    axisId: z.string().min(1),
    factionId: z.string().min(1),
    operator: comparisonOperatorSchema,
    threshold: z.number(),
  }),
])

/**
 * Conditions réellement éditables dans le formulaire de nœud.
 *
 * Sous-ensemble de `ConditionAtom` (`types/visibilityConditions.ts`), qui porte en plus
 * `reputation_fr94` et `faction_title` — évalués à l'exécution mais non produits ici.
 */
export type ConditionAtomForm = z.infer<typeof conditionAtomSchema>

export const visibilityConditionsBlockSchema = z.object({
  combinator: z.enum(['AND', 'OR']),
  items: z.array(conditionAtomSchema).min(1),
})
