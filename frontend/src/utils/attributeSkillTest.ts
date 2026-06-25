/**
 * Parse et compose le format Unity ``Attribut+Compétence:DD``.
 */
import { rankFuzzyOptions } from './fuzzyMatch'

export interface AttributeSkillTestParts {
  attribute: string
  skill: string
  dc: string
}

const FORBIDDEN_IN_NAME = /[\s:+]/u

/** Découpe une chaîne test Unity en trois parties éditables. */
export function parseAttributeSkillTest(value: string | undefined): AttributeSkillTestParts {
  if (!value?.trim()) {
    return { attribute: '', skill: '', dc: '' }
  }
  const trimmed = value.trim()
  const colonIdx = trimmed.lastIndexOf(':')
  if (colonIdx < 0) {
    const plusIdx = trimmed.indexOf('+')
    if (plusIdx < 0) {
      return { attribute: trimmed, skill: '', dc: '' }
    }
    return {
      attribute: trimmed.slice(0, plusIdx).trim(),
      skill: trimmed.slice(plusIdx + 1).trim(),
      dc: '',
    }
  }
  const dc = trimmed.slice(colonIdx + 1).trim()
  const head = trimmed.slice(0, colonIdx)
  const plusIdx = head.indexOf('+')
  if (plusIdx < 0) {
    return { attribute: head.trim(), skill: '', dc }
  }
  return {
    attribute: head.slice(0, plusIdx).trim(),
    skill: head.slice(plusIdx + 1).trim(),
    dc,
  }
}

/** Compose le format Unity ; chaîne vide si les trois champs sont vides. */
export function formatAttributeSkillTest(parts: AttributeSkillTestParts): string | undefined {
  const attribute = parts.attribute.trim()
  const skill = parts.skill.trim()
  const dc = parts.dc.trim()
  if (!attribute && !skill && !dc) {
    return undefined
  }
  return `${attribute}+${skill}:${dc}`
}

export type AttributeSkillTestField = 'attribute' | 'skill' | 'dc'

/** Messages concis par sous-champ (validation locale). */
export function localAttributeSkillTestFieldError(
  field: AttributeSkillTestField,
  value: string,
): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }
  if (field === 'dc') {
    if (!/^\d+$/u.test(trimmed)) {
      return 'Le DD doit être un nombre entier.'
    }
    return undefined
  }
  if (FORBIDDEN_IN_NAME.test(trimmed)) {
    return field === 'attribute'
      ? 'Pas d\'espace ni de « + » ou « : ».'
      : 'Pas d\'espace — nom GDD sans espace.'
  }
  return undefined
}

/** Indique si les trois champs forment un test valide côté format Unity. */
export function isCompleteAttributeSkillTest(parts: AttributeSkillTestParts): boolean {
  const attribute = parts.attribute.trim()
  const skill = parts.skill.trim()
  const dc = parts.dc.trim()
  if (!attribute || !skill || !dc) {
    return false
  }
  if (FORBIDDEN_IN_NAME.test(attribute) || FORBIDDEN_IN_NAME.test(skill)) {
    return false
  }
  return /^\d+$/u.test(dc)
}

export interface CatalogTokenOption {
  id: string
  label: string
}

/** Résout une saisie vers l'identifiant catalogue (exact ou meilleur match). */
export function resolveCatalogToken(
  raw: string,
  options: CatalogTokenOption[],
): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const exact = options.find(
    (option) => option.id === trimmed || option.label === trimmed,
  )
  if (exact) return exact.id
  const compact = trimmed.replace(/\s+/g, '')
  const compactMatch = options.find(
    (option) => option.id.replace(/\s+/g, '') === compact,
  )
  if (compactMatch) return compactMatch.id
  const ranked = rankFuzzyOptions(options, trimmed, 1)
  if (ranked[0]?.score >= 40) return ranked[0].id
  return trimmed.replace(/\s+/g, '')
}
