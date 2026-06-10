/**
 * Alertes seuils GDD (non bloquantes) — logique alignée sur le backend.
 */
import { MAX_CONVERSATIONAL_FLAGS, MAX_COUNTERS } from '../constants/dialogueFlagThresholds'
import type { DialogueFlagBinding } from '../types/dialogueFlags'
import type { FlagDefinition } from '../types/flags'

export function computeDialogueFlagThresholdWarnings(
  bindings: DialogueFlagBinding[],
  catalog: FlagDefinition[]
): string[] {
  const byId = Object.fromEntries(catalog.map((f) => [f.id, f]))
  let conversational = 0
  let counters = 0
  for (const b of bindings) {
    const meta = byId[b.flagId]
    if (b.type === 'compteur') {
      counters += 1
      continue
    }
    if (meta?.scope?.toLowerCase() === 'conversationnel') {
      conversational += 1
    }
  }
  const warnings: string[] = []
  if (conversational > MAX_CONVERSATIONAL_FLAGS) {
    warnings.push(
      `Liaisons « conversationnelles » : ${conversational} (repère GDD ≤ ${MAX_CONVERSATIONAL_FLAGS}).`
    )
  }
  if (counters > MAX_COUNTERS) {
    warnings.push(`Compteurs liés : ${counters} (repère GDD ≤ ${MAX_COUNTERS}).`)
  }
  return warnings
}
