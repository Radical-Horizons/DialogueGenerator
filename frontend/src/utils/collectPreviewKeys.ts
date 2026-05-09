/**
 * Collecte des clés flags/réputation référencées dans le graphe (Story 9.4).
 */
import type { Node } from 'reactflow'
import type { ChoiceEffect } from '../types/choiceEffects'
import type { ConditionAtom, VisibilityConditionsBlock } from '../types/visibilityConditions'
import type { SkillCheckDefinition } from './skillChecks'

function walkAtoms(block: VisibilityConditionsBlock | undefined, flagOut: Set<string>, repOut: Set<string>): void {
  if (!block?.items?.length) return
  for (const atom of block.items as ConditionAtom[]) {
    if (atom.kind === 'reputation') {
      repOut.add(`${atom.axisId}::${atom.factionId}`)
    } else if (atom.kind === 'reputation_fr94') {
      repOut.add([
        'fr94',
        atom.heroineId,
        atom.target.kind,
        atom.target.id,
        atom.axis,
        atom.readMode,
      ].join('::'))
    } else if (atom.kind === 'faction_title' && atom.flagId) {
      flagOut.add(atom.flagId)
    } else if (atom.kind === 'flag_bool' || atom.kind === 'flag_counter' || atom.kind === 'flag_enum') {
      flagOut.add(atom.flagId)
    }
  }
}

function walkEffects(effects: ChoiceEffect[] | undefined, flagOut: Set<string>, repOut: Set<string>): void {
  if (!effects?.length) return
  for (const e of effects) {
    if (e.kind === 'reputation_delta') {
      repOut.add(`${e.axisId}::${e.factionId}`)
    } else if (e.kind === 'reputation_delta_fr94') {
      repOut.add(['fr94', e.heroineId, e.target.kind, e.target.id, e.axis, 'final_npc'].join('::'))
    } else if (e.kind === 'set_bool' || e.kind === 'set_enum' || e.kind === 'adjust_counter') {
      flagOut.add(e.flagId)
    }
  }
}

/**
 * Retourne les ids de flags et les clés réputation (axe::faction) utilisés dans conditions/effets.
 */
export function collectKeysFromGraphNodes(nodes: Node[]): {
  flagIds: string[]
  reputationKeys: string[]
  skillAttributeIds: string[]
  skillIds: string[]
  usesEffort: boolean
} {
  const flagOut = new Set<string>()
  const repOut = new Set<string>()
  const skillAttributeOut = new Set<string>()
  const skillOut = new Set<string>()
  let usesEffort = false
  for (const n of nodes) {
    const data = n.data as {
      visibilityConditions?: VisibilityConditionsBlock
      choices?: Array<{
        visibilityConditions?: VisibilityConditionsBlock
        choiceEffects?: ChoiceEffect[]
        skillCheck?: SkillCheckDefinition
        effortCost?: number
      }>
    }
    walkAtoms(data.visibilityConditions, flagOut, repOut)
    for (const ch of data.choices ?? []) {
      walkAtoms(ch.visibilityConditions, flagOut, repOut)
      walkEffects(ch.choiceEffects, flagOut, repOut)
      if (ch.skillCheck) {
        skillAttributeOut.add(ch.skillCheck.attributeId)
        skillOut.add(ch.skillCheck.skillId)
      }
      if (typeof ch.effortCost === 'number' && ch.effortCost > 0) {
        usesEffort = true
      }
    }
  }
  return {
    flagIds: [...flagOut].sort(),
    reputationKeys: [...repOut].sort(),
    skillAttributeIds: [...skillAttributeOut].sort(),
    skillIds: [...skillOut].sort(),
    usesEffort,
  }
}
