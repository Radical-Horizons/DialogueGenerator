/**
 * Résumés et application locale des effets choix (Story 9.3).
 */
import type { FlagDefinition } from '../types/flags'
import type { VisibilityEvalState } from '../types/visibilityConditions'
import type { ChoiceEffect } from '../types/choiceEffects'

const PRESTIGE_DELTA_ABS_MAX = 15
const DEFAULT_REP_DELTA_ABS_MAX = 20
/** Aligné sur `services/reputation_effect_bounds.py` (Crainte). */
const CRAINTE_DELTA_ABS_MAX = 25

/** Bornes delta réputation (aligné GDD / services/reputation_effect_bounds.py). */
export function reputationDeltaBounds(axisId: string): { min: number; max: number } {
  const a = axisId.trim().toLowerCase()
  if (a.includes('prestige')) {
    return { min: -PRESTIGE_DELTA_ABS_MAX, max: PRESTIGE_DELTA_ABS_MAX }
  }
  if (a.includes('crainte') || a.includes('fear')) {
    return { min: -CRAINTE_DELTA_ABS_MAX, max: CRAINTE_DELTA_ABS_MAX }
  }
  return { min: -DEFAULT_REP_DELTA_ABS_MAX, max: DEFAULT_REP_DELTA_ABS_MAX }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

function repKey(axisId: string, factionId: string): string {
  return `${axisId}::${factionId}`
}

function applyCounterOp(current: number, op: '=' | '+=' | '-=', operand: number): number {
  if (op === '=') return operand
  if (op === '+=') return current + operand
  return current - operand
}

function numericBounds(meta: FlagDefinition | undefined): { lo: number; hi: number } {
  if (!meta || meta.semanticType !== 'compteur') {
    return { lo: Number.MIN_SAFE_INTEGER, hi: Number.MAX_SAFE_INTEGER }
  }
  const lo = typeof meta.minValue === 'number' ? meta.minValue : Number(meta.minValue ?? 0)
  const hi = typeof meta.maxValue === 'number' ? meta.maxValue : Number(meta.maxValue ?? 0)
  if (Number.isFinite(lo) && Number.isFinite(hi)) return { lo, hi }
  return { lo: -(2 ** 31), hi: 2 ** 31 - 1 }
}

/**
 * Applique une liste d'effets à l'état de simulation (flags + réputation), dans l'ordre.
 */
export function applyChoiceEffectsToEvalState(
  prev: VisibilityEvalState,
  effects: ChoiceEffect[] | undefined,
  catalogById?: Record<string, FlagDefinition>
): VisibilityEvalState {
  if (!effects?.length) return prev
  const flags = { ...prev.flags }
  const reputation = { ...prev.reputation }

  for (const eff of effects) {
    if (eff.kind === 'set_bool') {
      flags[eff.flagId] = eff.value
      continue
    }
    if (eff.kind === 'set_enum') {
      flags[eff.flagId] = eff.value
      continue
    }
    if (eff.kind === 'adjust_counter') {
      const meta = catalogById?.[eff.flagId]
      const { lo, hi } = numericBounds(meta)
      const curRaw = flags[eff.flagId]
      const cur =
        typeof curRaw === 'number' ? curRaw : typeof curRaw === 'string' ? parseFloat(curRaw) || 0 : 0
      const next = applyCounterOp(cur, eff.operator, eff.value)
      flags[eff.flagId] = clamp(next, lo, hi)
      continue
    }
    if (eff.kind === 'reputation_delta') {
      const key = repKey(eff.axisId, eff.factionId)
      const { min, max } = reputationDeltaBounds(eff.axisId)
      const d = clamp(eff.delta, min, max)
      const prevR = reputation[key] ?? 0
      reputation[key] = prevR + d
    }
  }

  return { flags, reputation }
}

/** Une ligne courte pour tooltips / badges. */
export function formatChoiceEffectLine(effect: ChoiceEffect): string {
  switch (effect.kind) {
    case 'set_bool':
      return `${effect.flagId} = ${effect.value}`
    case 'adjust_counter':
      return `${effect.flagId} ${effect.operator} ${effect.value}`
    case 'set_enum':
      return `${effect.flagId} → ${effect.value}`
    case 'reputation_delta':
      return `${effect.axisId} / ${effect.factionId} ${effect.delta >= 0 ? '+' : ''}${effect.delta}`
    default:
      return ''
  }
}

/** Résumé concaténé non vide pour aperçu choix / graphe. */
export function formatChoiceEffectsSummary(effects: ChoiceEffect[] | undefined): string {
  if (!effects?.length) return ''
  return effects.map(formatChoiceEffectLine).filter(Boolean).join(' · ')
}
