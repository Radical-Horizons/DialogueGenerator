/**
 * API client pour les endpoints de gestion de graphes.
 */
import apiClient from './client'
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
  CalculateLayoutRequest,
  CalculateLayoutResponse,
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
  request: GenerateNodeRequest
): Promise<GenerateNodeResponse> {
  // Timeout adaptatif : 5 min pour batch ou TestNode (plusieurs appels LLM), 2 min pour single
  const longTimeout = 300000
  const shortTimeout = 120000
  const timeout =
    request.generate_all_choices || isTestNodeGeneration(request.parent_node_id)
      ? longTimeout
      : shortTimeout
  const response = await apiClient.post<GenerateNodeResponse>(
    `/api/v1/unity-dialogues/graph/generate-node`,
    request,
    { timeout }
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
