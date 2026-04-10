/**
 * API client pour les endpoints de gestion de graphes.
 */
import apiClient from './client'
import { buildCostEstimateHeaders, type CostEstimateHeadersInput } from './costEstimateHeaders'
import type {
  LoadGraphRequest,
  LoadGraphResponse,
  SaveGraphRequest,
  SaveGraphResponse,
  GenerateNodeRequest,
  GenerateNodeResponse,
  EstimateCostRequest,
  EstimateCostResponse,
  RegenerateNodeRequest,
  RegenerateNodeResponse,
  NodePromptResponse,
  ValidateGraphRequest,
  ValidateGraphResponse,
  ValidateSchemaRequest,
  ValidateSchemaResponse,
  SimulateFlowRequest,
  SimulateFlowResponse,
  ValidateLoreExplicitRequest,
  ValidateLoreExplicitResponse,
  EvaluateDialogueQualityRequest,
  EvaluateDialogueQualityResponse,
  CalculateLayoutRequest,
  CalculateLayoutResponse,
  DetectAiSlopRequest,
  DetectAiSlopResponse,
  DetectContextDroppingRequest,
  DetectContextDroppingResponse,
  ContextDroppingRules,
} from '../types/graph'

/**
 * Charge un dialogue Unity JSON et le convertit en graphe.
 */
export async function loadGraph(request: LoadGraphRequest): Promise<LoadGraphResponse> {
  const response = await apiClient.post<LoadGraphResponse>(
    `/api/v1/unity-dialogues/graph/load`,
    request
  )
  return response.data
}

/**
 * Sauvegarde un graphe modifié (reconvertit en Unity JSON).
 */
export async function saveGraph(request: SaveGraphRequest): Promise<SaveGraphResponse> {
  const response = await apiClient.post<SaveGraphResponse>(
    `/api/v1/unity-dialogues/graph/save`,
    request
  )
  return response.data
}

/**
 * Sauvegarde un graphe et écrit le fichier sur disque (conversion + validation + écriture en un appel).
 */
export async function saveGraphAndWrite(request: SaveGraphRequest): Promise<SaveGraphResponse> {
  const response = await apiClient.post<SaveGraphResponse>(
    `/api/v1/unity-dialogues/graph/save-and-write`,
    request
  )
  return response.data
}

/**
 * Estime le coût LLM avant génération (pas d'appel LLM).
 */
export async function estimateCost(
  request: EstimateCostRequest
): Promise<EstimateCostResponse> {
  const response = await apiClient.post<EstimateCostResponse>(
    `/api/v1/unity-dialogues/graph/estimate-cost`,
    request
  )
  return response.data
}

/** Détecte si la génération cible un TestNode (4 nœuds = 4 appels LLM, timeout long). */
function isTestNodeGeneration(parentNodeId: string): boolean {
  return parentNodeId.startsWith('test-node-') || parentNodeId.startsWith('test:')
}

/**
 * Génère un nœud en contexte avec l'IA.
 */
export async function generateNode(
  request: GenerateNodeRequest,
  costEstimate?: CostEstimateHeadersInput
): Promise<GenerateNodeResponse> {
  // Timeout adaptatif : 5 min pour batch ou TestNode (plusieurs appels LLM), 2 min pour single
  const longTimeout = 300000
  const shortTimeout = 120000
  const timeout =
    request.generate_all_choices || isTestNodeGeneration(request.parent_node_id)
      ? longTimeout
      : shortTimeout
  const hdr = buildCostEstimateHeaders(costEstimate)
  const response = await apiClient.post<GenerateNodeResponse>(
    `/api/v1/unity-dialogues/graph/generate-node`,
    request,
    { timeout, ...(hdr ? { headers: hdr } : {}) }
  )
  return response.data
}

/**
 * Valide un graphe (nœuds orphelins, références cassées, cycles).
 */
export async function validateGraph(
  request: ValidateGraphRequest
): Promise<ValidateGraphResponse> {
  const response = await apiClient.post<ValidateGraphResponse>(
    `/api/v1/unity-dialogues/graph/validate`,
    request
  )
  return response.data
}

/**
 * Contradictions lore explicites (FR38) — faits GDD vs texte nœuds.
 */
export async function validateLoreExplicit(
  request: ValidateLoreExplicitRequest
): Promise<ValidateLoreExplicitResponse> {
  const response = await apiClient.post<ValidateLoreExplicitResponse>(
    `/api/v1/unity-dialogues/graph/validate-lore-explicit`,
    request
  )
  return response.data
}

/**
 * Évalue la qualité narrative du graphe via juge LLM (FR42).
 */
export async function evaluateDialogueQuality(
  request: EvaluateDialogueQualityRequest
): Promise<EvaluateDialogueQualityResponse> {
  const response = await apiClient.post<EvaluateDialogueQualityResponse>(
    `/api/v1/unity-dialogues/graph/evaluate-dialogue-quality`,
    request,
    { timeout: 120000 }
  )
  return response.data
}

/**
 * Détecte les motifs « AI slop » (GPT-isms, répétitions, génériques) — FR43.
 */
export async function detectAiSlop(request: DetectAiSlopRequest): Promise<DetectAiSlopResponse> {
  const response = await apiClient.post<DetectAiSlopResponse>(
    `/api/v1/unity-dialogues/graph/detect-ai-slop`,
    request,
    { timeout: 60000 }
  )
  return response.data
}

/**
 * Détecte l'absence ou l'usage trop indirect du contexte GDD (FR44).
 */
export async function detectContextDropping(
  request: DetectContextDroppingRequest
): Promise<DetectContextDroppingResponse> {
  const response = await apiClient.post<DetectContextDroppingResponse>(
    `/api/v1/unity-dialogues/graph/detect-context-dropping`,
    request,
    { timeout: 60000 }
  )
  return response.data
}

/**
 * Récupère les règles anti-context-dropping persistées (Story 4.10).
 */
export async function getContextDroppingRules(): Promise<ContextDroppingRules> {
  const response = await apiClient.get<ContextDroppingRules>(
    `/api/v1/validation/rules/context-dropping`
  )
  return response.data
}

/**
 * Sauvegarde les règles anti-context-dropping (Story 4.10).
 */
export async function putContextDroppingRules(rules: ContextDroppingRules): Promise<ContextDroppingRules> {
  const response = await apiClient.put<ContextDroppingRules>(
    `/api/v1/validation/rules/context-dropping`,
    rules
  )
  return response.data
}

/**
 * Calcule un layout automatique pour le graphe.
 */
export async function calculateLayout(
  request: CalculateLayoutRequest
): Promise<CalculateLayoutResponse> {
  const response = await apiClient.post<CalculateLayoutResponse>(
    `/api/v1/unity-dialogues/graph/calculate-layout`,
    request
  )
  return response.data
}

/**
 * Valide la conformité du graphe courant contre le schéma JSON Unity (FR48).
 */
export async function validateSchema(request: ValidateSchemaRequest): Promise<ValidateSchemaResponse> {
  const response = await apiClient.post<ValidateSchemaResponse>(
    `/api/v1/unity-dialogues/graph/validate-schema`,
    request,
    { timeout: 30000 }
  )
  return response.data
}

/**
 * Simule le flux de dialogue pour détecter dead ends + cul-de-sacs (FR46).
 */
export async function simulateFlow(request: SimulateFlowRequest): Promise<SimulateFlowResponse> {
  const response = await apiClient.post<SimulateFlowResponse>(
    `/api/v1/unity-dialogues/graph/simulate-flow`,
    request,
    { timeout: 30000 }
  )
  return response.data
}

/**
 * Accepte un nœud généré (passe de "pending" à "accepted").
 */
export async function acceptNode(
  dialogueId: string,
  nodeId: string
): Promise<void> {
  await apiClient.post(
    `/api/v1/unity-dialogues/graph/nodes/${nodeId}/accept`,
    { dialogue_id: dialogueId }
  )
}

/**
 * Rejette un nœud généré (supprime le nœud).
 */
export async function rejectNode(
  dialogueId: string,
  nodeId: string
): Promise<void> {
  await apiClient.post(
    `/api/v1/unity-dialogues/graph/nodes/${nodeId}/reject`,
    { dialogue_id: dialogueId }
  )
}

/**
 * Régénère un nœud avec de nouvelles instructions (Story 1.10).
 */
export async function regenerateNode(
  nodeId: string,
  request: RegenerateNodeRequest
): Promise<RegenerateNodeResponse> {
  const response = await apiClient.post<RegenerateNodeResponse>(
    `/api/v1/unity-dialogues/graph/nodes/${nodeId}/regenerate`,
    request,
    { timeout: 120000 }
  )
  return response.data
}

/**
 * Récupère le prompt exact ou reconstruit pour un nœud (Story 1.14).
 */
export async function getNodePrompt(
  dialogueId: string,
  nodeId: string
): Promise<NodePromptResponse> {
  const response = await apiClient.get<NodePromptResponse>(
    '/api/v1/unity-dialogues/graph/prompt',
    { params: { dialogue_id: dialogueId, node_id: nodeId } }
  )
  return response.data
}
