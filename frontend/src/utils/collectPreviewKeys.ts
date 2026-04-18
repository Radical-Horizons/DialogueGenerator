/**
 * Collecte des clés flags/réputation référencées dans le graphe (Story 9.4).
 */
import type { Node } from 'reactflow'
import type { ChoiceEffect } from '../types/choiceEffects'
import type { ConditionAtom, VisibilityConditionsBlock } from '../types/visibilityConditions'

function walkAtoms(block: VisibilityConditionsBlock | undefined, flagOut: Set<string>, repOut: Set<string>): void {
  if (!block?.items?.length) return
  for (const atom of block.items as ConditionAtom[]) {
    if (atom.kind === 'reputation') {
      repOut.add(`${atom.axisId}::${atom.factionId}`)
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
} {
  const flagOut = new Set<string>()
  const repOut = new Set<string>()
  for (const n of nodes) {
    const data = n.data as {
      visibilityConditions?: VisibilityConditionsBlock
      choices?: Array<{
        visibilityConditions?: VisibilityConditionsBlock
        choiceEffects?: ChoiceEffect[]
      }>
    }
    walkAtoms(data.visibilityConditions, flagOut, repOut)
    for (const ch of data.choices ?? []) {
      walkAtoms(ch.visibilityConditions, flagOut, repOut)
      walkEffects(ch.choiceEffects, flagOut, repOut)
    }
  }
  return {
    flagIds: [...flagOut].sort(),
    reputationKeys: [...repOut].sort(),
  }
}
