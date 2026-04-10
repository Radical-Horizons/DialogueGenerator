/**
 * FR39 — cycle de vie des avertissements lore (Examiné / Ignoré) et clés stables.
 * Persistance localStorage ; extension backend possible via endpoint dédié (non implémenté ici).
 */
import type { ValidationErrorDetail } from '../types/graph'

/** Types d’avertissements concernés par la revue humaine (pas les erreurs explicites). */
export const LORE_DISMISSIBLE_WARNING_TYPES = new Set<string>([
  'lore_contradiction_potential',
  'lore_potential_ambiguity',
])

export type LoreWarningDisposition = 'active' | 'examined' | 'ignored'

const STORAGE_PREFIX = 'dg.loreWarnDispo.v1'

export function getLoreWarningStorageKey(scopeKey: string): string {
  return `${STORAGE_PREFIX}|${scopeKey}`
}

function simpleHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i += 1) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return h
}

/** Clé stable : priorité `lore_warning_key` API, sinon empreinte déterministe locale. */
export function resolveLoreWarningKey(detail: ValidationErrorDetail): string {
  const k = detail.lore_warning_key
  if (typeof k === 'string' && k.length > 0) {
    return k
  }
  const nid = detail.node_id ?? ''
  return `fb|${detail.type}|${nid}|${simpleHash(detail.message)}`
}

export function loadLoreDispositions(scopeKey: string): Record<string, LoreWarningDisposition> {
  if (typeof localStorage === 'undefined') {
    return {}
  }
  try {
    const raw = localStorage.getItem(getLoreWarningStorageKey(scopeKey))
    if (!raw) {
      return {}
    }
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') {
      return {}
    }
    return parsed as Record<string, LoreWarningDisposition>
  } catch {
    return {}
  }
}

export function saveLoreDispositions(
  scopeKey: string,
  map: Record<string, LoreWarningDisposition>
): void {
  if (typeof localStorage === 'undefined') {
    return
  }
  try {
    localStorage.setItem(getLoreWarningStorageKey(scopeKey), JSON.stringify(map))
  } catch {
    /* quota / mode privé */
  }
}

export function isDismissibleLoreWarning(detail: ValidationErrorDetail): boolean {
  return detail.severity === 'warning' && LORE_DISMISSIBLE_WARNING_TYPES.has(detail.type)
}

export interface LoreWarningFilterOptions {
  dispositions: Record<string, LoreWarningDisposition>
  showIgnored: boolean
  typeFilter: 'all' | string
}

/** Filtre la liste complète des issues validation (erreurs + warnings) pour le panneau. */
export function applyLoreWarningFilters(
  details: ValidationErrorDetail[],
  options: LoreWarningFilterOptions
): ValidationErrorDetail[] {
  return details.filter((e) => {
    if (!isDismissibleLoreWarning(e)) {
      return true
    }
    const key = resolveLoreWarningKey(e)
    const d = options.dispositions[key] ?? 'active'
    if (d === 'ignored' && !options.showIgnored) {
      return false
    }
    if (options.typeFilter !== 'all' && e.type !== options.typeFilter) {
      return false
    }
    return true
  })
}

export function countVisibleDismissibleLoreWarnings(
  details: ValidationErrorDetail[],
  options: LoreWarningFilterOptions
): number {
  return applyLoreWarningFilters(details, options).filter(isDismissibleLoreWarning).length
}
