/**
 * choiceId stable déterministe (miroir backend ``stable_choice_id`` / ADR-008).
 */
export function stableChoiceId(nodeId: string, choiceIndex: number): string {
  return `choice_${nodeId}_${choiceIndex}`
}
