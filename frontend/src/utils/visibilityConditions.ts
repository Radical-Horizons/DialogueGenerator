/**
 * Résumés textuels et évaluation pure des conditions de visibilité (Story 9.2).
 */
import type {
  ComparisonOperator,
  ConditionAtom,
  VisibilityConditionsBlock,
  VisibilityEvalState,
} from '../types/visibilityConditions'

function compareNums(a: number, op: ComparisonOperator, b: number): boolean {
  switch (op) {
    case '=':
      return a === b
    case '!=':
      return a !== b
    case '>=':
      return a >= b
    case '<=':
      return a <= b
    case '>':
      return a > b
    case '<':
      return a < b
    default:
      return false
  }
}

function numFromFlag(v: boolean | number | string | undefined): number | null {
  if (v === undefined) return null
  if (typeof v === 'number' && !Number.isNaN(v)) return v
  if (typeof v === 'boolean') return v ? 1 : 0
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

/**
 * Chaîne tooltip réputation (standard GDD — Story 9.2 AC5, axe × faction × seuil).
 */
export function formatReputationRequirement(
  axisId: string,
  factionId: string,
  operator: ComparisonOperator,
  threshold: number,
  current?: number,
): string {
  const cur = current !== undefined ? String(current) : 'X'
  const faction = factionId.trim() ? factionId : '—'
  return `Requiert : Réputation ${axisId} × ${faction} ${operator} ${threshold} (actuel : ${cur})`
}

/**
 * Résumé lisible d'un atome (une ligne).
 */
export function formatConditionAtomSummary(atom: ConditionAtom): string {
  switch (atom.kind) {
    case 'flag_bool':
      return `${atom.flagId} = ${atom.equals ? 'true' : 'false'}`
    case 'flag_counter':
      return `${atom.flagId} ${atom.operator} ${atom.value}`
    case 'flag_enum':
      return `${atom.flagId} ${atom.operator} ${atom.value}`
    case 'reputation':
      return formatReputationRequirement(
        atom.axisId,
        atom.factionId,
        atom.operator,
        atom.threshold,
      )
    default:
      return '?'
  }
}

/**
 * Résumé du bloc AND/OR pour badge / panneau.
 */
export function formatVisibilityConditionsSummary(block: VisibilityConditionsBlock | undefined): string {
  if (!block?.items?.length) return ''
  const inner = block.items.map(formatConditionAtomSummary)
  const sep = block.combinator === 'AND' ? ' ET ' : ' OU '
  return inner.join(sep)
}

/** Alias export (story / naming). */
export const formatConditionSummary = formatVisibilityConditionsSummary

function evalAtom(atom: ConditionAtom, state: VisibilityEvalState): boolean {
  switch (atom.kind) {
    case 'flag_bool': {
      const v = state.flags[atom.flagId]
      if (typeof v === 'boolean') return v === atom.equals
      if (v === undefined) return false
      return Boolean(v) === atom.equals
    }
    case 'flag_counter': {
      const raw = state.flags[atom.flagId]
      const left = numFromFlag(raw)
      if (left === null) return false
      return compareNums(left, atom.operator, atom.value)
    }
    case 'flag_enum': {
      const raw = state.flags[atom.flagId]
      const s = raw === undefined ? '' : String(raw)
      const ok = s === atom.value
      return atom.operator === '=' ? ok : !ok
    }
    case 'reputation': {
      const key = `${atom.axisId}::${atom.factionId}`
      const cur = state.reputation[key]
      if (typeof cur !== 'number' || Number.isNaN(cur)) return false
      return compareNums(cur, atom.operator, atom.threshold)
    }
    default:
      return false
  }
}

export interface EvaluateVisibilityResult {
  satisfied: boolean
}

/**
 * Évalue un bloc structuré avec l'état de simulation donné.
 */
export function evaluateVisibilityConditions(
  block: VisibilityConditionsBlock | undefined,
  state: VisibilityEvalState,
): EvaluateVisibilityResult {
  if (!block?.items?.length) return { satisfied: true }
  const results = block.items.map((a) => evalAtom(a, state))
  const satisfied =
    block.combinator === 'AND' ? results.every(Boolean) : results.some(Boolean)
  return { satisfied }
}

/**
 * Legacy : chaîne ``condition`` sur choix (NOT X, FLAG) — hors scope structuré ;
 * si présente seule, on considère non évaluable ici (résumé texte brut).
 */
export function hasStructuredVisibility(
  visibilityConditions: VisibilityConditionsBlock | undefined,
  legacyCondition?: string,
): boolean {
  return Boolean(
    (visibilityConditions?.items?.length ?? 0) > 0 ||
      (legacyCondition && legacyCondition.trim() !== ''),
  )
}
