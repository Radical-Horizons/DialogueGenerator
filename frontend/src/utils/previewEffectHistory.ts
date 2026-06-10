/**
 * Lignes d'historique pour le preview dialogue (Story 9.4) — transitions alignées sur applyChoiceEffectsToEvalState.
 */
import type { FlagDefinition } from '../types/flags'
import type { VisibilityEvalState } from '../types/visibilityConditions'
import type { ChoiceEffect } from '../types/choiceEffects'
import { applyChoiceEffectsToEvalState, formatChoiceEffectLine } from './choiceEffects'

function repKey(axisId: string, factionId: string): string {
  return `${axisId}::${factionId}`
}

function summarizeDelta(
  before: VisibilityEvalState,
  after: VisibilityEvalState,
  effect: ChoiceEffect,
): string {
  const base = formatChoiceEffectLine(effect)
  if (effect.kind === 'set_bool') {
    const b = before.flags[effect.flagId]
    const a = after.flags[effect.flagId]
    return `${effect.flagId} : ${String(b)} → ${String(a)}`
  }
  if (effect.kind === 'set_enum') {
    const b = before.flags[effect.flagId]
    const a = after.flags[effect.flagId]
    return `${effect.flagId} : ${String(b ?? '∅')} → ${String(a)}`
  }
  if (effect.kind === 'adjust_counter') {
    const b = before.flags[effect.flagId]
    const a = after.flags[effect.flagId]
    const bn = typeof b === 'number' ? b : Number(b ?? 0)
    const an = typeof a === 'number' ? a : Number(a ?? 0)
    return `${effect.flagId} : ${bn} → ${an}`
  }
  if (effect.kind === 'reputation_delta') {
    const key = repKey(effect.axisId, effect.factionId)
    const br = before.reputation[key] ?? 0
    const ar = after.reputation[key] ?? 0
    return `${effect.axisId} × ${effect.factionId} : ${br} → ${ar} (${base})`
  }
  return base
}

/**
 * Produit une ligne lisible par effet appliqué (valeur avant → après où pertinent).
 */
export function linesForAppliedChoiceEffects(
  prev: VisibilityEvalState,
  effects: ChoiceEffect[] | undefined,
  catalogById?: Record<string, FlagDefinition>,
): string[] {
  if (!effects?.length) return []
  const out: string[] = []
  let cur = prev
  for (const eff of effects) {
    const next = applyChoiceEffectsToEvalState(cur, [eff], catalogById)
    out.push(summarizeDelta(cur, next, eff))
    cur = next
  }
  return out
}
