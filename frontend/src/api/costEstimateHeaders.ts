/**
 * En-têtes optionnels pour aligner CostGovernanceMiddleware sur une estimation client
 * (le corps POST n'est pas relu en middleware).
 */
export interface CostEstimateHeadersInput {
  promptTokens?: number | null
  completionTokens?: number | null
}

/**
 * Construit les en-têtes HTTP pour l'estimation tokens (valeurs finies et >= 0 uniquement).
 *
 * @param input - Compteurs issus de POST /estimate-tokens ou équivalent.
 * @returns Objet en-têtes ou undefined si rien à envoyer.
 */
export function buildCostEstimateHeaders(
  input?: CostEstimateHeadersInput
): Record<string, string> | undefined {
  if (!input) {
    return undefined
  }
  const headers: Record<string, string> = {}
  const pt = input.promptTokens
  if (typeof pt === 'number' && Number.isFinite(pt) && pt >= 0) {
    headers['X-Estimated-Prompt-Tokens'] = String(Math.floor(pt))
  }
  const ct = input.completionTokens
  if (typeof ct === 'number' && Number.isFinite(ct) && ct >= 0) {
    headers['X-Estimated-Completion-Tokens'] = String(Math.floor(ct))
  }
  return Object.keys(headers).length > 0 ? headers : undefined
}
