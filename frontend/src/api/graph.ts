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
 * Génère un nœud en contexte avec l'IA.
 */
export async function generateNode(
  request: GenerateNodeRequest
): Promise<GenerateNodeResponse> {
  // Timeout adaptatif : 4 minutes pour batch (parallélisé, mais sécurité), 2 minutes pour single
  const timeout = request.generate_all_choices ? 240000 : 120000
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
