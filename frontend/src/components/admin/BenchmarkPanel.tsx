import { useCallback, useEffect, useState } from 'react'
import axios from 'axios'

import { listLLMModels } from '../../api/config'
import {
  controlBenchmarkRun,
  controlJudgePass,
  getBenchmarkRunProgress,
  getBenchmarkRunReport,
  getJudgePassProgress,
  getPairwisePassProgress,
  listBenchmarkRuns,
  listBenchmarkSuites,
  listCriteriaGrids,
  previewBenchmarkRun,
  startBenchmarkRun,
  startJudgePass,
  startPairwisePass,
} from '../../api/benchmark'
import type { LLMModelResponse } from '../../types/api'
import type {
  BenchmarkRun,
  BenchmarkRunPreview,
  BenchmarkRunProgress,
  BenchmarkRunReport,
  BenchmarkSuiteSummary,
  BenchmarkNarrationMode,
  CriteriaGridSummary,
  JudgePassProgress,
  PairwisePassProgress,
} from '../../types/benchmark'
import { theme } from '../../theme'
import { Tabs, type Tab } from '../shared/Tabs'

const POLL_INTERVAL_MS = 3000
const MAX_POLL_FAILURES = 3
const DEFAULT_JUDGE_MODEL = 'gpt-5.6-luna'

const fieldStyle: React.CSSProperties = {
  minHeight: 44,
  boxSizing: 'border-box',
  padding: '0.55rem 0.7rem',
  color: theme.input.color,
  background: theme.input.background,
  border: `1px solid ${theme.input.border}`,
  borderRadius: 4,
  width: '100%',
}

const cellStyle: React.CSSProperties = {
  padding: '0.4rem 0.6rem',
  borderBottom: `1px solid ${theme.border.primary}`,
  textAlign: 'left',
  whiteSpace: 'nowrap',
}

const scrollBox: React.CSSProperties = { overflowX: 'auto', maxWidth: '100%' }

function apiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 403) {
      return 'Accès admin requis.'
    }
    // Le backend renvoie 409 pour trois refus distincts (verrou, tarif inconnu,
    // plafond sous l'estimation) : écraser `detail` enverrait l'admin chercher un
    // run concurrent qui n'existe pas.
    const detail = error.response?.data?.detail
    if (typeof detail === 'string' && detail.trim().length > 0) {
      return detail
    }
    if (error.response?.status === 409) {
      return 'Un run de benchmark est déjà en cours.'
    }
    const message = error.response?.data?.error?.message
    if (typeof message === 'string') {
      return message
    }
  }
  return 'Une erreur est survenue. Réessayez.'
}

function formatUsd(value: number): string {
  return `${value.toFixed(4)} $`
}

function formatRate(value: number): string {
  const percent = value * 100
  // Arrondir à l'entier ferait lire « 0 % » sur un biais de position réel, et
  // « 100 % » sur un run qui compte une génération recalée.
  if (percent > 0 && percent < 0.5) {
    return '< 0,5 %'
  }
  if (percent < 100 && percent > 99.5) {
    return '> 99,5 %'
  }
  return `${percent.toFixed(1).replace('.', ',')} %`
}

/**
 * Pilotage du mode Benchmark : estimer, lancer, suivre, lire.
 *
 * Le panneau n'agrège rien lui-même : le rapport arrive déjà calculé par
 * `GET /runs/{id}/report`, parce que ces calculs sont des règles de protocole
 * (`.claude/rules/benchmark.md`) et non de la mise en forme.
 */
export function BenchmarkPanel() {
  const [tabId, setTabId] = useState('launch')
  const [error, setError] = useState<string | null>(null)

  const [suites, setSuites] = useState<BenchmarkSuiteSummary[]>([])
  const [models, setModels] = useState<LLMModelResponse[]>([])
  const [suiteId, setSuiteId] = useState('')
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const [repetitions, setRepetitions] = useState(1)
  const [narrationMode, setNarrationMode] = useState<BenchmarkNarrationMode>('sans')
  const [preview, setPreview] = useState<BenchmarkRunPreview | null>(null)
  const [budgetCap, setBudgetCap] = useState(1)
  const [busy, setBusy] = useState(false)

  const [progress, setProgress] = useState<BenchmarkRunProgress | null>(null)
  const [stale, setStale] = useState(false)

  const [runs, setRuns] = useState<BenchmarkRun[]>([])
  const [reportRunId, setReportRunId] = useState('')
  const [report, setReport] = useState<BenchmarkRunReport | null>(null)

  const [grids, setGrids] = useState<CriteriaGridSummary[]>([])
  const [gridId, setGridId] = useState('')
  const [judgeModel, setJudgeModel] = useState('')
  const [judgeCap, setJudgeCap] = useState(1)
  const [withDuels, setWithDuels] = useState(true)
  const [judgeProgress, setJudgeProgress] = useState<JudgePassProgress | null>(null)
  const [duelProgress, setDuelProgress] = useState<PairwisePassProgress | null>(null)
  const [judgeNotice, setJudgeNotice] = useState<string | null>(null)

  // Une troncature n'est pas un défaut du modèle mais du banc : tant qu'il y en
  // a, les taux et les notes ne se comparent pas. Le dire une fois, en haut,
  // plutôt que de le laisser dans une colonne qu'on ne lira pas.
  const truncatedTotal = (report?.models ?? []).reduce(
    (total, entry) => total + entry.truncated,
    0,
  )

  useEffect(() => {
    void (async () => {
      try {
        const [suiteList, modelList, gridList] = await Promise.all([
          listBenchmarkSuites(),
          listLLMModels(),
          listCriteriaGrids(),
        ])
        setSuites(suiteList.suites)
        setModels(modelList.models ?? [])
        setGrids(gridList.grids)
        if (suiteList.suites.length > 0) {
          setSuiteId((current) => current || suiteList.suites[0].suite_id)
        }
        if (gridList.grids.length > 0) {
          setGridId((current) => current || gridList.grids[0].grid_id)
        }
        const available = modelList.models ?? []
        if (available.length > 0) {
          // Luna par défaut : tier volume/coût, la notation multiplie les appels.
          const luna = available.find((m) => m.model_identifier === DEFAULT_JUDGE_MODEL)
          setJudgeModel((current) => current || (luna ?? available[0]).model_identifier)
        }
      } catch (err) {
        setError(apiErrorMessage(err))
      }
    })()
  }, [])

  // Un run vit dans le processus API, pas dans cet onglet : sans cette
  // hydratation, un simple F5 pendant un run facturé ferait disparaître pause et
  // annulation — la coupure d'urgence d'une dépense.
  useEffect(() => {
    void (async () => {
      try {
        const current = await getBenchmarkRunProgress()
        if (current.active) {
          setProgress(current)
          setTabId('monitor')
        }
      } catch (err) {
        setError(apiErrorMessage(err))
      }
    })()
  }, [])

  // Le sondage ne doit survivre ni à la fin du run, ni au démontage, ni à une
  // API devenue muette : sinon il interroge indéfiniment et l'écran affiche un
  // état périmé comme s'il était courant.
  useEffect(() => {
    if (!progress?.active) {
      return undefined
    }
    let cancelled = false
    let failures = 0
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const next = await getBenchmarkRunProgress()
          if (cancelled) {
            return
          }
          failures = 0
          setStale(false)
          setProgress(next)
        } catch (err) {
          if (cancelled) {
            return
          }
          failures += 1
          setError(apiErrorMessage(err))
          if (failures >= MAX_POLL_FAILURES) {
            setStale(true)
            setProgress((current) => (current ? { ...current, active: false } : current))
          }
        }
      })()
    }, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [progress?.active])

  const toggleModel = useCallback((modelId: string) => {
    setPreview(null)
    setSelectedModels((current) =>
      current.includes(modelId)
        ? current.filter((item) => item !== modelId)
        : [...current, modelId],
    )
  }, [])

  const handlePreview = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await previewBenchmarkRun({
        suite_id: suiteId,
        models: selectedModels,
        repetitions,
        narration_mode: narrationMode,
        judge_model: judgeModel || null,
        with_duels: withDuels,
      })
      setPreview(result)
      setBudgetCap(Math.max(Number((result.estimate.estimated_max_usd * 1.2).toFixed(2)), 0.01))
      setJudgeCap(Math.max(Number((result.judging_max_usd * 1.2).toFixed(2)), 0.01))
    } catch (err) {
      setPreview(null)
      setError(apiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }, [suiteId, selectedModels, repetitions, narrationMode, judgeModel, withDuels])

  const handleLaunch = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const launched = await startBenchmarkRun({
        suite_id: suiteId,
        // La version chiffrée par l'aperçu, pas « la courante » : une suite
        // resemée entre l'estimation et le clic changerait ce qu'on facture.
        suite_version: preview?.suite_version ?? null,
        models: selectedModels,
        repetitions,
        narration_mode: narrationMode,
        budget_cap_usd: budgetCap,
        // La notation part seule à la fin de la génération, côté API : fermer
        // l'onglet n'interrompt pas la chaîne.
        auto_judge: gridId && judgeModel
          ? {
              grid_id: gridId,
              judge_model: judgeModel,
              budget_cap_usd: judgeCap,
              with_duels: withDuels,
            }
          : null,
      })
      // Le run tourne déjà et dépense : basculer sur le suivi avant tout autre
      // appel, sinon un échec du sondage afficherait « erreur » sur un
      // lancement réussi et le second clic tomberait sur le verrou.
      setReportRunId(launched.run_id)
      setTabId('monitor')
      try {
        setProgress(await getBenchmarkRunProgress())
      } catch (pollError) {
        setError(apiErrorMessage(pollError))
      }
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }, [suiteId, preview, selectedModels, repetitions, narrationMode, budgetCap, gridId, judgeModel, judgeCap, withDuels])

  const handleControl = useCallback(
    async (action: 'pause' | 'unpause' | 'cancel') => {
      // Le run visé est celui que l'écran affiche : `GET /runs/progress` est
      // global au processus, et viser un identifiant mémorisé au lancement
      // annulerait le mauvais run si un autre admin en a démarré un depuis.
      const targetRunId = progress?.run_id
      if (!targetRunId) {
        return
      }
      setError(null)
      try {
        await controlBenchmarkRun(targetRunId, action)
        setProgress(await getBenchmarkRunProgress())
      } catch (err) {
        setError(apiErrorMessage(err))
      }
    },
    [progress?.run_id],
  )

  const loadRuns = useCallback(async () => {
    try {
      const data = await listBenchmarkRuns()
      setRuns(data.runs)
      if (data.runs.length > 0) {
        setReportRunId((current) => current || data.runs[0].run_id)
      }
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }, [])

  // La notation vit dans le processus API comme le run : sans hydratation, une
  // passe en cours serait invisible après un rafraîchissement, contrôles compris.
  useEffect(() => {
    void (async () => {
      try {
        const [judge, duels] = await Promise.all([
          getJudgePassProgress(),
          getPairwisePassProgress(),
        ])
        if (judge.active) {
          setJudgeProgress(judge)
        }
        if (duels.active) {
          setDuelProgress(duels)
        }
        if (judge.active || duels.active) {
          setTabId('report')
        }
      } catch (err) {
        setError(apiErrorMessage(err))
      }
    })()
  }, [])

  useEffect(() => {
    if (!judgeProgress?.active && !duelProgress?.active) {
      return undefined
    }
    let cancelled = false
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const [judge, duels] = await Promise.all([
            getJudgePassProgress(),
            getPairwisePassProgress(),
          ])
          if (cancelled) {
            return
          }
          setJudgeProgress(judge)
          setDuelProgress(duels)
        } catch (err) {
          if (!cancelled) {
            setError(apiErrorMessage(err))
          }
        }
      })()
    }, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [judgeProgress?.active, duelProgress?.active])

  const handleJudge = useCallback(async () => {
    if (!reportRunId) {
      return
    }
    setBusy(true)
    setError(null)
    setJudgeNotice(null)
    const config = { grid_id: gridId, judge_model: judgeModel, budget_cap_usd: judgeCap }
    try {
      const rubric = await startJudgePass(reportRunId, config)
      setJudgeProgress(await getJudgePassProgress())
      const notices = [
        `${rubric.verdicts_total} verdict(s) à produire, ${formatUsd(rubric.estimated_max_usd)} au plus.`,
      ]
      if (withDuels) {
        const duels = await startPairwisePass(reportRunId, config)
        setDuelProgress(await getPairwisePassProgress())
        notices.push(
          `${duels.duels_total} duel(s), ${formatUsd(duels.estimated_max_usd)} au plus.`,
        )
        if (duels.unpairable_slots > 0) {
          notices.push(
            `${duels.unpairable_slots} slot(s) sans vis-à-vis valide : non appariés.`,
          )
        }
        if (duels.judge_is_candidate) {
          notices.push(
            '⚠️ Le juge est aussi candidat de ce run : il se note lui-même.',
          )
        }
      }
      setJudgeNotice(notices.join(' '))
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }, [reportRunId, gridId, judgeModel, judgeCap, withDuels])

  const handleJudgeControl = useCallback(
    async (leg: 'judge' | 'pairwise', action: 'pause' | 'unpause' | 'cancel') => {
      const target = leg === 'judge' ? judgeProgress?.run_id : duelProgress?.run_id
      if (!target) {
        return
      }
      setError(null)
      try {
        await controlJudgePass(target, leg, action)
        setJudgeProgress(await getJudgePassProgress())
        setDuelProgress(await getPairwisePassProgress())
      } catch (err) {
        setError(apiErrorMessage(err))
      }
    },
    [judgeProgress?.run_id, duelProgress?.run_id],
  )

  const handleReport = useCallback(async () => {
    if (!reportRunId) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      setReport(await getBenchmarkRunReport(reportRunId))
    } catch (err) {
      setReport(null)
      setError(apiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }, [reportRunId])

  const handleTabChange = useCallback(
    (nextTab: string) => {
      setTabId(nextTab)
      if (nextTab === 'report') {
        void loadRuns()
      }
    },
    [loadRuns],
  )

  // `Number('')` vaut NaN, et `NaN <= 0` est faux : sans `isFinite`, vider le
  // champ laisserait le bouton actif et produirait un 422 illisible.
  const capIsFinite = Number.isFinite(budgetCap) && budgetCap > 0
  const capTooLow = Boolean(
    capIsFinite && preview && budgetCap < preview.estimate.estimated_min_usd,
  )
  const capIsUsable = capIsFinite && !capTooLow

  const launchView = (
    <div style={{ display: 'grid', gap: '1rem', maxWidth: 720 }}>
      <label style={{ display: 'grid', gap: '0.35rem' }}>
        <span>Suite de test</span>
        <select
          aria-label="Suite de test"
          value={suiteId}
          onChange={(event) => {
            setSuiteId(event.target.value)
            setPreview(null)
          }}
          style={fieldStyle}
        >
          {suites.map((suite) => (
            <option key={suite.suite_id} value={suite.suite_id}>
              {suite.name || suite.suite_id} — {suite.case_count} cas
            </option>
          ))}
        </select>
      </label>

      <fieldset style={{ border: `1px solid ${theme.border.primary}`, borderRadius: 4, padding: '0.75rem' }}>
        <legend>Modèles candidats</legend>
        {models.map((model) => (
          <label
            key={model.model_identifier}
            style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', minHeight: 44 }}
          >
            <input
              type="checkbox"
              checked={selectedModels.includes(model.model_identifier)}
              onChange={() => toggleModel(model.model_identifier)}
            />
            <span>{model.display_name || model.model_identifier}</span>
          </label>
        ))}
      </fieldset>

      <label style={{ display: 'grid', gap: '0.35rem' }}>
        <span>Répétitions par cas et par modèle</span>
        <input
          type="number"
          aria-label="Répétitions par cas et par modèle"
          min={1}
          max={20}
          value={repetitions}
          onChange={(event) => {
            setRepetitions(Number(event.target.value))
            setPreview(null)
          }}
          style={fieldStyle}
        />
      </label>

      <label style={{ display: 'grid', gap: '0.35rem' }}>
        <span>Didascalies de narration</span>
        <select
          aria-label="Didascalies de narration"
          value={narrationMode}
          onChange={(event) => {
            setNarrationMode(event.target.value as BenchmarkNarrationMode)
            setPreview(null)
          }}
          style={fieldStyle}
        >
          <option value="sans">Sans didascalies</option>
          <option value="avec">Avec didascalies</option>
        </select>
        <small style={{ color: theme.text.secondary }}>
          Le mode fait partie de l’identité du run : deux modes ne se comparent pas.
        </small>
      </label>

      <fieldset style={{ border: `1px solid ${theme.border.primary}`, borderRadius: 4, padding: '0.75rem' }}>
        <legend>Notation (enchaînée automatiquement)</legend>
        <small style={{ color: theme.text.secondary, display: 'block', marginBottom: '0.5rem' }}>
          Générer sans noter ne répond à aucune question : la notation démarre seule à
          la fin de la génération, côté serveur. Fermer l’onglet ne l’interrompt pas.
        </small>
        <label style={{ display: 'grid', gap: '0.35rem', marginBottom: '0.5rem' }}>
          <span>Grille de critères</span>
          <select
            aria-label="Grille de critères du lancement"
            value={gridId}
            onChange={(event) => {
              setGridId(event.target.value)
              setPreview(null)
            }}
            style={fieldStyle}
          >
            {grids.map((grid) => (
              <option key={grid.grid_id} value={grid.grid_id}>
                {grid.name || grid.grid_id} — {grid.criterion_count} critères (v{grid.version})
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'grid', gap: '0.35rem', marginBottom: '0.5rem' }}>
          <span>Modèle juge</span>
          <select
            aria-label="Modèle juge du lancement"
            value={judgeModel}
            onChange={(event) => {
              setJudgeModel(event.target.value)
              setPreview(null)
            }}
            style={fieldStyle}
          >
            {models.map((model) => (
              <option key={model.model_identifier} value={model.model_identifier}>
                {model.display_name || model.model_identifier}
              </option>
            ))}
          </select>
        </label>
        {selectedModels.includes(judgeModel) && (
          <p style={{ color: theme.state.warning.color, margin: '0 0 0.5rem' }}>
            Ce juge est aussi candidat de ce run : il notera ses propres générations
            et celles de ses concurrents.
          </p>
        )}
        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', minHeight: 44 }}>
          <input
            type="checkbox"
            checked={withDuels}
            onChange={(event) => {
              setWithDuels(event.target.checked)
              setPreview(null)
            }}
          />
          <span>Enchaîner aussi les duels (jambe relative)</span>
        </label>
      </fieldset>

      <button
        type="button"
        onClick={() => void handlePreview()}
        disabled={
          busy
          || !suiteId
          || selectedModels.length === 0
          || !Number.isInteger(repetitions)
          || repetitions < 1
          || repetitions > 20
        }
        style={{ ...fieldStyle, cursor: 'pointer' }}
      >
        Estimer le coût
      </button>

      {preview && (
        <div
          style={{
            border: `1px solid ${theme.border.primary}`,
            borderRadius: 4,
            padding: '0.75rem',
            display: 'grid',
            gap: '0.5rem',
          }}
        >
          <strong>Estimation — aucun appel facturé pour l’instant</strong>
          <span>
            {preview.cases} cas × {selectedModels.length} modèles × {repetitions} ={' '}
            {preview.estimate.generations} générations
          </span>
          <span>
            Génération : {formatUsd(preview.estimate.estimated_min_usd)} à{' '}
            {formatUsd(preview.estimate.estimated_max_usd)}
          </span>
          {preview.judging_max_usd > 0 && (
            <span>
              Notation : jusqu’à {formatUsd(preview.judging_max_usd)}
              {preview.duels_max_usd > 0
                ? ` (dont ${formatUsd(preview.duels_max_usd)} de duels)`
                : ''}
            </span>
          )}
          <strong>
            Total au pire :{' '}
            {formatUsd(preview.estimate.estimated_max_usd + preview.judging_max_usd)}
          </strong>
          <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
            {preview.model_diagnostics.map((diagnostic) => (
              <li key={diagnostic.model_id}>
                {diagnostic.model_id} —{' '}
                {diagnostic.usable ? 'utilisable' : `inutilisable : ${diagnostic.reason ?? '—'}`}
              </li>
            ))}
          </ul>
          {preview.blocking_reasons.map((reason) => (
            <p key={reason} role="alert" style={{ color: theme.state.error.color, margin: 0 }}>
              {reason}
            </p>
          ))}

          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Plafond budgétaire dur (USD)</span>
            <input
              type="number"
              aria-label="Plafond budgétaire dur (USD)"
              min={0.01}
              step={0.01}
              value={budgetCap}
              onChange={(event) => setBudgetCap(Number(event.target.value))}
              style={fieldStyle}
            />
          </label>
          {capTooLow && (
            <p role="alert" style={{ color: theme.state.error.color, margin: 0 }}>
              Plafond inférieur à l’estimation basse ({formatUsd(preview.estimate.estimated_min_usd)})
              : le run serait refusé.
            </p>
          )}
          {preview.judging_max_usd > 0 && (
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Plafond budgétaire de la notation (USD)</span>
              <input
                type="number"
                aria-label="Plafond budgétaire de la notation au lancement (USD)"
                min={0.01}
                step={0.01}
                value={judgeCap}
                onChange={(event) => setJudgeCap(Number(event.target.value))}
                style={fieldStyle}
              />
            </label>
          )}
          <button
            type="button"
            onClick={() => void handleLaunch()}
            disabled={busy || !preview.launchable || !capIsUsable}
            style={{ ...fieldStyle, cursor: 'pointer' }}
          >
            Lancer : générer puis noter (dépense réelle)
          </button>
        </div>
      )}
    </div>
  )

  const monitorView = (
    <div style={{ display: 'grid', gap: '0.75rem', maxWidth: 720 }}>
      {!progress && <p>Aucun run suivi dans cette session.</p>}
      {progress && (
        <>
          <span>
            Run {progress.run_id ?? '—'} — {progress.status ?? 'inconnu'}
            {progress.paused ? ' (en pause)' : ''}
          </span>
          <progress
            aria-label="Progression du run"
            value={progress.generations_completed}
            max={Math.max(progress.generations_total, 1)}
          />
          <span>
            {progress.generations_completed} / {progress.generations_total} générations
          </span>
          <span>
            Dépensé : {formatUsd(progress.spent_usd)} sur {formatUsd(progress.budget_cap_usd)}
          </span>
          {progress.active && (
            <span>
              En cours : {progress.current_model ?? '—'} sur {progress.current_case ?? '—'}
            </span>
          )}
          {progress.message && <span>{progress.message}</span>}
          {stale && (
            <p role="alert" style={{ color: theme.state.error.color, margin: 0 }}>
              L’API ne répond plus : cet état est figé et peut être périmé. Le run
              continue peut-être — recharger la page pour reprendre le suivi.
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => void handleControl(progress.paused ? 'unpause' : 'pause')}
              disabled={!progress.active}
              style={{ ...fieldStyle, width: 'auto', cursor: 'pointer' }}
            >
              {progress.paused ? 'Reprendre' : 'Suspendre'}
            </button>
            <button
              type="button"
              onClick={() => void handleControl('cancel')}
              disabled={!progress.active}
              style={{ ...fieldStyle, width: 'auto', cursor: 'pointer' }}
            >
              Annuler le run
            </button>
          </div>
        </>
      )}
    </div>
  )

  const reportView = (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'end' }}>
        <label style={{ display: 'grid', gap: '0.35rem', minWidth: 280 }}>
          <span>Run</span>
          <select
            aria-label="Run"
            value={reportRunId}
            onChange={(event) => setReportRunId(event.target.value)}
            style={fieldStyle}
          >
            {runs.map((run) => (
              <option key={run.run_id} value={run.run_id}>
                {run.run_id} — {run.identity.suite_id} ({run.identity.narration_mode})
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void handleReport()}
          disabled={busy || !reportRunId}
          style={{ ...fieldStyle, width: 'auto', cursor: 'pointer' }}
        >
          Afficher le rapport
        </button>
      </div>

      <section
        style={{
          border: `1px solid ${theme.border.primary}`,
          borderRadius: 4,
          padding: '0.75rem',
          display: 'grid',
          gap: '0.6rem',
          maxWidth: 720,
        }}
      >
        <strong>Noter ce run</strong>
        <small style={{ color: theme.text.secondary }}>
          Générer ne suffit pas : sans passe de notation, le rapport n’a aucune note à
          montrer. La rubrique note chaque génération seule ; les duels comparent les
          modèles deux à deux, dans les deux sens.
        </small>
        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>Grille de critères</span>
          <select
            aria-label="Grille de critères"
            value={gridId}
            onChange={(event) => setGridId(event.target.value)}
            style={fieldStyle}
          >
            {grids.map((grid) => (
              <option key={grid.grid_id} value={grid.grid_id}>
                {grid.name || grid.grid_id} — {grid.criterion_count} critères (v{grid.version})
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>Modèle juge</span>
          <select
            aria-label="Modèle juge"
            value={judgeModel}
            onChange={(event) => setJudgeModel(event.target.value)}
            style={fieldStyle}
          >
            {models.map((model) => (
              <option key={model.model_identifier} value={model.model_identifier}>
                {model.display_name || model.model_identifier}
              </option>
            ))}
          </select>
          <small style={{ color: theme.text.secondary }}>
            Le juge est enregistré avec chaque note : deux juges ne s’agrègent jamais.
          </small>
        </label>
        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', minHeight: 44 }}>
          <input
            type="checkbox"
            checked={withDuels}
            onChange={(event) => setWithDuels(event.target.checked)}
          />
          <span>Lancer aussi les duels (jambe relative)</span>
        </label>
        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>Plafond budgétaire de la notation (USD)</span>
          <input
            type="number"
            aria-label="Plafond budgétaire de la notation (USD)"
            min={0.01}
            step={0.01}
            value={judgeCap}
            onChange={(event) => setJudgeCap(Number(event.target.value))}
            style={fieldStyle}
          />
        </label>
        <button
          type="button"
          onClick={() => void handleJudge()}
          disabled={
            busy
            || !reportRunId
            || !gridId
            || !judgeModel
            || !Number.isFinite(judgeCap)
            || judgeCap <= 0
            || Boolean(judgeProgress?.active)
            || Boolean(duelProgress?.active)
          }
          style={{ ...fieldStyle, cursor: 'pointer' }}
        >
          Noter le run (dépense réelle)
        </button>
        {judgeNotice && <span>{judgeNotice}</span>}

        {judgeProgress && (
          <div style={{ display: 'grid', gap: '0.3rem' }}>
            <span>
              Rubrique — {judgeProgress.status ?? 'inconnu'} ·{' '}
              {judgeProgress.verdicts_completed} / {judgeProgress.verdicts_total} verdicts ·{' '}
              {formatUsd(judgeProgress.spent_usd)} sur {formatUsd(judgeProgress.budget_cap_usd)}
            </span>
            <progress
              aria-label="Progression de la notation"
              value={judgeProgress.verdicts_completed}
              max={Math.max(judgeProgress.verdicts_total, 1)}
            />
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() =>
                  void handleJudgeControl('judge', judgeProgress.paused ? 'unpause' : 'pause')
                }
                disabled={!judgeProgress.active}
                style={{ ...fieldStyle, width: 'auto', cursor: 'pointer' }}
              >
                {judgeProgress.paused ? 'Reprendre la notation' : 'Suspendre la notation'}
              </button>
              <button
                type="button"
                onClick={() => void handleJudgeControl('judge', 'cancel')}
                disabled={!judgeProgress.active}
                style={{ ...fieldStyle, width: 'auto', cursor: 'pointer' }}
              >
                Annuler la notation
              </button>
            </div>
          </div>
        )}

        {duelProgress && (
          <div style={{ display: 'grid', gap: '0.3rem' }}>
            <span>
              Duels — {duelProgress.status ?? 'inconnu'} · {duelProgress.duels_completed} /{' '}
              {duelProgress.duels_total} · {formatUsd(duelProgress.spent_usd)} sur{' '}
              {formatUsd(duelProgress.budget_cap_usd)}
            </span>
            <progress
              aria-label="Progression des duels"
              value={duelProgress.duels_completed}
              max={Math.max(duelProgress.duels_total, 1)}
            />
            <button
              type="button"
              onClick={() => void handleJudgeControl('pairwise', 'cancel')}
              disabled={!duelProgress.active}
              style={{ ...fieldStyle, width: 'auto', cursor: 'pointer' }}
            >
              Annuler les duels
            </button>
          </div>
        )}
      </section>

      {report && (
        <div style={{ display: 'grid', gap: '1.25rem' }}>
          <span>
            Suite {report.suite_id} — mode « {report.narration_mode} » — {report.repetitions}{' '}
            répétition(s) — état {report.status} — dépense {formatUsd(report.spent_usd)}
          </span>
          {report.status === 'interrupted_budget' && (
            <p role="alert" style={{ color: theme.state.warning.color, margin: 0 }}>
              Run tronqué par le plafond budgétaire : les taux portent sur la part
              réellement exécutée, pas sur la suite entière.
            </p>
          )}
          {report.verdicts_unreadable && (
            <p role="alert" style={{ color: theme.state.error.color, margin: 0 }}>
              Des verdicts existent mais n’ont pas pu être lus : ce rapport est
              incomplet — ne pas le lire comme « pas encore noté ».
            </p>
          )}

          {truncatedTotal > 0 && (
            <p role="alert" style={{ color: theme.state.error.color, margin: 0 }}>
              {truncatedTotal} génération(s) coupée(s) par le plafond de complétion.
              C’est un défaut du banc, pas des modèles : leurs taux et leurs notes
              ne sont pas comparables tant que le plafond n’est pas relevé.
            </p>
          )}

          <section>
            <h2 style={{ fontSize: '1rem', margin: '0 0 0.5rem' }}>Validité par modèle</h2>
            <div style={scrollBox}>
              <table style={{ borderCollapse: 'collapse', minWidth: 520 }}>
                <thead>
                  <tr>
                    <th style={cellStyle}>Modèle</th>
                    <th style={cellStyle}>Tentées</th>
                    <th style={cellStyle}>Valides</th>
                    <th style={cellStyle}>Recalées</th>
                    <th style={cellStyle}>Erreurs config</th>
                    <th style={cellStyle}>Tronquées</th>
                    <th style={cellStyle}>Taux</th>
                    <th style={cellStyle}>Coût</th>
                    <th style={cellStyle}>Portes échouées</th>
                  </tr>
                </thead>
                <tbody>
                  {report.models.map((entry) => (
                    <tr key={entry.model_id}>
                      <td style={cellStyle}>{entry.model_id}</td>
                      <td style={cellStyle}>{entry.attempted}</td>
                      <td style={cellStyle}>{entry.valid}</td>
                      <td style={cellStyle}>{entry.invalid}</td>
                      <td style={cellStyle}>{entry.config_error || '—'}</td>
                      <td style={cellStyle}>{entry.truncated || '—'}</td>
                      <td style={cellStyle}>
                        {entry.attempted === 0 ? 'aucune tentative' : formatRate(entry.validity_rate)}
                      </td>
                      <td style={cellStyle}>{formatUsd(entry.cost_usd)}</td>
                      <td style={cellStyle}>
                        {Object.entries(entry.gate_failures)
                          .map(([gate, count]) => `${gate} ×${count}`)
                          .join(', ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {report.judges.length === 0 && (
            <p>
              Ce run n’a pas encore été noté. Les notes viennent d’une passe de
              jugement distincte de la génération : lancez-la avec « Noter le run »
              ci-dessus, puis réaffichez le rapport.
            </p>
          )}

          {report.judges.map((judge) => {
            // Union rubrique ∪ duels : les deux passes sont indépendantes, et
            // n'afficher que la rubrique effacerait un run jugé en duels seuls.
            const modelIds = Array.from(
              new Set([
                ...judge.models.map((entry) => entry.model_id),
                ...judge.pairwise.map((entry) => entry.model_id),
              ]),
            ).sort()
            return (
            <section key={`${judge.judge_model}-${judge.grid_id}-${judge.grid_version}`}>
              <h2 style={{ fontSize: '1rem', margin: '0 0 0.5rem' }}>
                Juge {judge.judge_model} — grille {judge.grid_id} v{judge.grid_version}
              </h2>
              <div style={scrollBox}>
                <table style={{ borderCollapse: 'collapse', minWidth: 520 }}>
                  <thead>
                    <tr>
                      <th style={cellStyle}>Modèle</th>
                      <th style={cellStyle}>Note pondérée /10</th>
                      <th style={cellStyle}>Verdicts</th>
                      <th style={cellStyle}>Échecs du juge</th>
                      <th style={cellStyle}>Duels G/N/P</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelIds.map((modelId) => {
                      const summary = judge.models.find((entry) => entry.model_id === modelId)
                      const duels = judge.pairwise.find((entry) => entry.model_id === modelId)
                      return (
                        <tr key={modelId}>
                          <td style={cellStyle}>{modelId}</td>
                          <td style={cellStyle}>
                            {summary?.weighted_mean == null
                              ? 'non noté'
                              : summary.weighted_mean.toFixed(2)}
                          </td>
                          <td style={cellStyle}>{summary?.scored_count ?? 0}</td>
                          <td style={cellStyle}>{summary?.judge_errors ?? 0}</td>
                          <td style={cellStyle}>
                            {duels ? `${duels.wins}/${duels.ties}/${duels.losses}` : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {judge.pairwise_decided > 0 && (
                <small style={{ color: theme.text.secondary }}>
                  {judge.pairwise_decided} duel(s) tranché(s) · désaccord de position{' '}
                  {formatRate(judge.position_disagreement_rate)} — au-delà de quelques pour cent,
                  le juge est sensible à l’ordre de présentation.
                </small>
              )}
            </section>
            )
          })}
        </div>
      )}
    </div>
  )

  const tabs: Tab[] = [
    { id: 'launch', label: 'Lancer', content: launchView },
    { id: 'monitor', label: 'Suivi', content: monitorView },
    { id: 'report', label: 'Rapport', content: reportView },
  ]

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {error && (
        <p role="alert" style={{ color: theme.state.error.color, margin: 0 }}>
          {error}
        </p>
      )}
      <Tabs variant="segmented" activeTabId={tabId} onTabChange={handleTabChange} tabs={tabs} />
    </div>
  )
}
