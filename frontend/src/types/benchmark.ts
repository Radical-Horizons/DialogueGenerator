/**
 * Types du mode Benchmark, alignés sur `api/schemas/benchmark*.py`.
 *
 * Aucun calcul de protocole ne vit côté client : validité, moyennes pondérées et
 * taux de victoire arrivent déjà agrégés par `GET /runs/{id}/report`. Ces types
 * décrivent ce que le serveur envoie, ils n'en dérivent rien.
 */

export type BenchmarkNarrationMode = 'avec' | 'sans'

export type BenchmarkRunStatus =
  | 'running'
  | 'paused'
  | 'completed'
  | 'interrupted_budget'
  | 'cancelled'
  | 'failed'

export interface BenchmarkSuiteSummary {
  suite_id: string
  version: number
  name: string
  description: string
  case_count: number
  updated_at?: string | null
}

export interface BenchmarkSuiteListResponse {
  suites: BenchmarkSuiteSummary[]
}

export interface BenchmarkCostEstimate {
  generations: number
  estimated_min_usd: number
  estimated_max_usd: number
  unpriced_models: string[]
}

export interface BenchmarkModelDiagnostic {
  model_id: string
  usable: boolean
  reason?: string | null
}

export interface BenchmarkRunPreviewRequest {
  suite_id: string
  suite_version?: number | null
  models: string[]
  repetitions: number
  narration_mode: BenchmarkNarrationMode
  /** Juge de la notation enchaînée ; `null` ne chiffre que la génération. */
  judge_model?: string | null
  with_duels?: boolean
}

/** Notation enchaînée à la génération : le plafond se décide au lancement. */
export interface BenchmarkAutoJudgeConfig {
  grid_id: string
  grid_version?: number | null
  judge_model: string
  budget_cap_usd: number
  with_duels: boolean
}

export interface BenchmarkRunPreview {
  suite_id: string
  suite_version: number
  cases: number
  estimate: BenchmarkCostEstimate
  model_diagnostics: BenchmarkModelDiagnostic[]
  launchable: boolean
  blocking_reasons: string[]
  /** Borne haute de la notation enchaînée — hypothèse « toutes valides ». */
  judging_max_usd: number
  duels_max_usd: number
  judging_unpriced: boolean
}

export interface BenchmarkRunConfig extends BenchmarkRunPreviewRequest {
  budget_cap_usd: number
  auto_judge?: BenchmarkAutoJudgeConfig | null
}

export interface BenchmarkRunLaunchResponse {
  run_id: string
  status: BenchmarkRunStatus
  estimate: BenchmarkCostEstimate
  model_diagnostics: BenchmarkModelDiagnostic[]
}

export interface BenchmarkRunIdentity {
  suite_id: string
  suite_version: number
  suite_fingerprint: string
  models: string[]
  repetitions: number
  narration_mode: BenchmarkNarrationMode
}

export interface BenchmarkRun {
  run_id: string
  identity: BenchmarkRunIdentity
  status: BenchmarkRunStatus
  generations_total: number
  generations_completed: number
  spent_usd: number
  message: string
  created_at?: string | null
  updated_at?: string | null
}

export interface BenchmarkRunListResponse {
  runs: BenchmarkRun[]
}

export interface BenchmarkRunProgress {
  active: boolean
  run_id?: string | null
  status?: BenchmarkRunStatus | null
  generations_total: number
  generations_completed: number
  current_model?: string | null
  current_case?: string | null
  current_repetition?: number | null
  spent_usd: number
  budget_cap_usd: number
  paused: boolean
  message: string
}

export interface BenchmarkRunControlResponse {
  run_id: string
  applied: boolean
  message: string
}

export interface BenchmarkModelValidity {
  model_id: string
  generations: number
  valid: number
  invalid: number
  config_error: number
  /** `valid + invalid` — les erreurs de configuration sont hors du taux. */
  attempted: number
  validity_rate: number
  cost_usd: number
  gate_failures: Record<string, number>
}

export interface BenchmarkCriterionScore {
  criterion_id: string
  label: string
  direction: 'higher_is_better' | 'lower_is_better'
  weight: number
  mean_score: number
  scored_count: number
}

export interface BenchmarkModelRubricSummary {
  model_id: string
  scored_count: number
  judge_errors: number
  /** `null` quand rien n'a été noté — l'absence de note n'est pas un zéro. */
  weighted_mean: number | null
  criteria: BenchmarkCriterionScore[]
}

export interface BenchmarkPairwiseSummary {
  model_id: string
  wins: number
  losses: number
  ties: number
  win_rate: number
}

export interface BenchmarkJudgeReport {
  judge_model: string
  grid_id: string
  grid_version: number
  models: BenchmarkModelRubricSummary[]
  pairwise: BenchmarkPairwiseSummary[]
  pairwise_decided: number
  pairwise_judge_errors: number
  position_disagreement_rate: number
}

export interface BenchmarkRunReport {
  run_id: string
  suite_id: string
  narration_mode: BenchmarkNarrationMode
  repetitions: number
  status: BenchmarkRunStatus
  spent_usd: number
  models: BenchmarkModelValidity[]
  /** Un bloc par juge **et par version de grille** : ni l'un ni l'autre ne s'agrège. */
  judges: BenchmarkJudgeReport[]
  /** Des verdicts existent mais sont illisibles : le rapport est incomplet. */
  verdicts_unreadable: boolean
}

// ---------------------------------------------------------------------------
// Notation — rubrique (jambe absolue) et duels (jambe relative)
// ---------------------------------------------------------------------------

export interface CriteriaGridSummary {
  grid_id: string
  version: number
  name: string
  description: string
  criterion_count: number
  updated_at?: string | null
}

export interface CriteriaGridListResponse {
  grids: CriteriaGridSummary[]
}

export type JudgePassStatus =
  | 'running'
  | 'paused'
  | 'completed'
  | 'interrupted_budget'
  | 'cancelled'
  | 'failed'

export interface JudgePassConfig {
  grid_id: string
  grid_version?: number | null
  judge_model: string
  budget_cap_usd: number
}

export interface JudgePassLaunchResponse {
  run_id: string
  judge_model: string
  status: JudgePassStatus
  verdicts_total: number
  estimated_max_usd: number
}

export interface PairwisePassLaunchResponse {
  run_id: string
  judge_model: string
  status: JudgePassStatus
  duels_total: number
  unpairable_slots: number
  estimated_max_usd: number
  /** Le juge est aussi candidat du run : conflit d'intérêt, à signaler. */
  judge_is_candidate: boolean
}

export interface JudgePassProgress {
  active: boolean
  run_id?: string | null
  judge_model?: string | null
  status?: JudgePassStatus | null
  verdicts_total: number
  verdicts_completed: number
  current_model?: string | null
  current_case?: string | null
  spent_usd: number
  budget_cap_usd: number
  paused: boolean
  message: string
}

export interface PairwisePassProgress {
  active: boolean
  run_id?: string | null
  judge_model?: string | null
  status?: JudgePassStatus | null
  duels_total: number
  duels_completed: number
  current_case?: string | null
  spent_usd: number
  budget_cap_usd: number
  paused: boolean
  message: string
}
