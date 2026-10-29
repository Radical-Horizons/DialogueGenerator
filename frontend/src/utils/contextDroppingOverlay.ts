/**
 * Overlay session des règles anti-drop d'un template (6.5) — detect options + clause prompt.
 */
import type { ContextDroppingRules, DetectContextDroppingOptionsState } from '../types/graph'

export const DEFAULT_CONTEXT_DROPPING_RULES: ContextDroppingRules = {
  rules_profile: 'strict',
  tolerance: null,
  mandatory_info: [],
  dialogue_type_overrides: {},
  schema_version: '1.0',
}

/**
 * Convertit une copie 4.10 en options de detect-context-dropping.
 */
export function rulesToDetectOptions(
  rules: ContextDroppingRules,
): DetectContextDroppingOptionsState {
  return {
    rules_profile: rules.rules_profile,
    tolerance: rules.tolerance ?? undefined,
    mandatory_info: rules.mandatory_info,
    dialogue_type_overrides: rules.dialogue_type_overrides,
  }
}

/**
 * Clause anti-drop injectée à l'envoi génération (ne pas écrire dans le textarea).
 */
export function buildAntiDropPromptClause(rules: ContextDroppingRules): string {
  const mode =
    rules.rules_profile === 'light'
      ? 'SUBTILES (lore implicite accepté ; ne signale que les informations entièrement absentes).'
      : 'EXPLICITES (faits GDD du contexte doivent figurer clairement dans répliques et effets ; les références uniquement implicites seront signalées). Inclus un DD de test (ex. Raison+Rhétorique:8) et/ou des deltas de réputation numériques (influenceDelta / respectDelta) dans le JSON des choix.'
  const mandatory =
    rules.mandatory_info.length > 0
      ? ` Informations obligatoires : ${rules.mandatory_info.join(', ')}.`
      : ''
  return `[Règles anti-context-dropping ${mode}]${mandatory}`
}

/**
 * Enrichit les instructions d'appel API si un overlay est actif.
 */
export function withAntiDropClause(
  userInstructions: string,
  rules: ContextDroppingRules | null | undefined,
): string {
  if (!rules) {
    return userInstructions
  }
  const clause = buildAntiDropPromptClause(rules)
  if (!userInstructions.trim()) {
    return clause
  }
  return `${userInstructions}\n\n${clause}`
}
