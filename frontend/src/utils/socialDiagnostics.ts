export const INFLUENCE_RESPECT_SYSTEM_LABEL = 'Influence & Respect (PJ possédés)'

export interface FactionTitleCondition {
  flagId?: string
  titleId?: string
}

export type FactionTitleSource = 'one_way_flag' | 'title_catalog'

export interface FactionTitleValidationResult {
  valid: boolean
  source?: FactionTitleSource
  message?: string
}

export interface SocialDiagnostic {
  code: 'social_system_confusion'
  message: string
}

export function formatSocialSystemConfusionMessage(axisId: string): string {
  return `${axisId} appartient au système ${INFLUENCE_RESPECT_SYSTEM_LABEL}, pas à la Réputation.`
}

export function validateFactionTitleCondition(
  condition: FactionTitleCondition,
  catalogTitleIds: Set<string> = new Set(),
): FactionTitleValidationResult {
  if (condition.flagId?.startsWith('Flag_faction_titre_')) {
    return { valid: true, source: 'one_way_flag' }
  }
  if (condition.titleId && catalogTitleIds.has(condition.titleId)) {
    return { valid: true, source: 'title_catalog' }
  }
  return {
    valid: false,
    message:
      'Un titre de faction doit référencer un flag one-way `Flag_faction_titre_{faction}` ou une entrée du catalogue titres.',
  }
}

export function diagnoseReputationAxisConfusion(axisId: string): SocialDiagnostic | null {
  if (axisId !== 'Influence' && axisId !== 'Respect') return null
  return {
    code: 'social_system_confusion',
    message: formatSocialSystemConfusionMessage(axisId),
  }
}
