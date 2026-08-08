/**
 * API client du mode Benchmark (admin).
 *
 * Un seul module pour toute la boucle : estimer, lancer, suivre, interrompre,
 * lire. Aucun agrégat n'est calculé ici — le rapport arrive déjà agrégé.
 */
import apiClient from './client'
import type {
  BenchmarkRun,
  BenchmarkRunControlResponse,
  BenchmarkRunConfig,
  BenchmarkRunLaunchResponse,
  BenchmarkRunListResponse,
  BenchmarkRunPreview,
  BenchmarkRunPreviewRequest,
  BenchmarkRunProgress,
  BenchmarkRunReport,
  BenchmarkSuiteListResponse,
  CriteriaGridListResponse,
  JudgePassConfig,
  JudgePassLaunchResponse,
  JudgePassProgress,
  PairwisePassLaunchResponse,
  PairwisePassProgress,
} from '../types/benchmark'

const BASE = '/api/v1/benchmark'

/**
 * Liste les suites de test disponibles.
 */
export async function listBenchmarkSuites(): Promise<BenchmarkSuiteListResponse> {
  const response = await apiClient.get<BenchmarkSuiteListResponse>(`${BASE}/suites`)
  return response.data
}

/**
 * Chiffre un run sans le créer ni dépenser.
 *
 * Route distincte du lancement, volontairement : `POST /runs` démarre le run
 * dans le même appel qu'il l'estime.
 */
export async function previewBenchmarkRun(
  request: BenchmarkRunPreviewRequest,
): Promise<BenchmarkRunPreview> {
  const response = await apiClient.post<BenchmarkRunPreview>(`${BASE}/runs/preview`, request)
  return response.data
}

/**
 * Démarre un run. Engage une dépense réelle, plafonnée par `budget_cap_usd`.
 */
export async function startBenchmarkRun(
  config: BenchmarkRunConfig,
): Promise<BenchmarkRunLaunchResponse> {
  const response = await apiClient.post<BenchmarkRunLaunchResponse>(`${BASE}/runs`, config)
  return response.data
}

/**
 * Retourne la progression du run en cours dans le processus API.
 */
export async function getBenchmarkRunProgress(): Promise<BenchmarkRunProgress> {
  const response = await apiClient.get<BenchmarkRunProgress>(`${BASE}/runs/progress`)
  return response.data
}

/**
 * Liste les runs persistés, du plus récent au plus ancien.
 */
export async function listBenchmarkRuns(): Promise<BenchmarkRunListResponse> {
  const response = await apiClient.get<BenchmarkRunListResponse>(`${BASE}/runs`)
  return response.data
}

/**
 * Retourne l'état persisté d'un run.
 */
export async function getBenchmarkRun(runId: string): Promise<BenchmarkRun> {
  const response = await apiClient.get<BenchmarkRun>(`${BASE}/runs/${encodeURIComponent(runId)}`)
  return response.data
}

/**
 * Suspend, reprend ou annule le run en cours.
 *
 * L'annulation est la coupure d'urgence d'une dépense : elle doit rester
 * atteignable tant que le run tourne.
 */
export async function controlBenchmarkRun(
  runId: string,
  action: 'pause' | 'unpause' | 'cancel',
): Promise<BenchmarkRunControlResponse> {
  const response = await apiClient.post<BenchmarkRunControlResponse>(
    `${BASE}/runs/${encodeURIComponent(runId)}/${action}`,
  )
  return response.data
}

/**
 * Retourne le rapport agrégé d'un run (validité par modèle, notes par juge).
 */
export async function getBenchmarkRunReport(runId: string): Promise<BenchmarkRunReport> {
  const response = await apiClient.get<BenchmarkRunReport>(
    `${BASE}/runs/${encodeURIComponent(runId)}/report`,
  )
  return response.data
}

/**
 * Liste les grilles de critères disponibles.
 */
export async function listCriteriaGrids(): Promise<CriteriaGridListResponse> {
  const response = await apiClient.get<CriteriaGridListResponse>(`${BASE}/criteria`)
  return response.data
}

/**
 * Lance la notation rubrique d'un run (jambe absolue). Dépense réelle.
 */
export async function startJudgePass(
  runId: string,
  config: JudgePassConfig,
): Promise<JudgePassLaunchResponse> {
  const response = await apiClient.post<JudgePassLaunchResponse>(
    `${BASE}/runs/${encodeURIComponent(runId)}/judge`,
    config,
  )
  return response.data
}

/**
 * Lance la comparaison par paires d'un run (jambe relative). Dépense réelle.
 */
export async function startPairwisePass(
  runId: string,
  config: JudgePassConfig,
): Promise<PairwisePassLaunchResponse> {
  const response = await apiClient.post<PairwisePassLaunchResponse>(
    `${BASE}/runs/${encodeURIComponent(runId)}/judge/pairwise`,
    config,
  )
  return response.data
}

/**
 * Progression de la passe de notation rubrique en cours.
 */
export async function getJudgePassProgress(): Promise<JudgePassProgress> {
  const response = await apiClient.get<JudgePassProgress>(`${BASE}/judge/progress`)
  return response.data
}

/**
 * Progression de la passe de duels en cours.
 */
export async function getPairwisePassProgress(): Promise<PairwisePassProgress> {
  const response = await apiClient.get<PairwisePassProgress>(`${BASE}/pairwise/progress`)
  return response.data
}

/**
 * Suspend, reprend ou annule une passe de jugement.
 *
 * `leg` choisit la jambe : notation absolue ou duels.
 */
export async function controlJudgePass(
  runId: string,
  leg: 'judge' | 'pairwise',
  action: 'pause' | 'unpause' | 'cancel',
): Promise<{ run_id: string; applied: boolean; message: string }> {
  const path = leg === 'judge' ? 'judge' : 'pairwise'
  const response = await apiClient.post<{ run_id: string; applied: boolean; message: string }>(
    `${BASE}/runs/${encodeURIComponent(runId)}/${path}/${action}`,
  )
  return response.data
}
