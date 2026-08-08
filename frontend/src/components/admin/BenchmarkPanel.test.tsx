import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { BenchmarkPanel } from './BenchmarkPanel'
import type {
  BenchmarkRunPreview,
  BenchmarkRunProgress,
  BenchmarkRunReport,
} from '../../types/benchmark'

const MODEL_A = 'gpt-5.6-luna'

vi.mock('../../api/config', () => ({
  listLLMModels: vi.fn(),
}))
vi.mock('../../api/benchmark', () => ({
  listBenchmarkSuites: vi.fn(),
  previewBenchmarkRun: vi.fn(),
  startBenchmarkRun: vi.fn(),
  getBenchmarkRunProgress: vi.fn(),
  listBenchmarkRuns: vi.fn(),
  controlBenchmarkRun: vi.fn(),
  getBenchmarkRunReport: vi.fn(),
}))

const api = await import('../../api/benchmark')
const configApi = await import('../../api/config')

function preview(overrides: Partial<BenchmarkRunPreview> = {}): BenchmarkRunPreview {
  return {
    suite_id: 'alteir-smoke',
    suite_version: 1,
    cases: 3,
    estimate: {
      generations: 3,
      estimated_min_usd: 0.1,
      estimated_max_usd: 0.25,
      unpriced_models: [],
    },
    model_diagnostics: [{ model_id: MODEL_A, usable: true, reason: null }],
    launchable: true,
    blocking_reasons: [],
    ...overrides,
  }
}

function progress(overrides: Partial<BenchmarkRunProgress> = {}): BenchmarkRunProgress {
  return {
    active: true,
    run_id: 'run-1',
    status: 'running',
    generations_total: 3,
    generations_completed: 1,
    current_model: MODEL_A,
    current_case: 'voknir',
    current_repetition: 0,
    spent_usd: 0.05,
    budget_cap_usd: 1,
    paused: false,
    message: '',
    ...overrides,
  }
}

beforeEach(() => {
  vi.mocked(configApi.listLLMModels).mockResolvedValue({
    models: [
      { model_identifier: MODEL_A, display_name: 'Luna', client_type: 'openai', max_tokens: 8000 },
    ],
    total: 1,
  })
  vi.mocked(api.listBenchmarkSuites).mockResolvedValue({
    suites: [
      {
        suite_id: 'alteir-smoke',
        version: 1,
        name: 'Smoke',
        description: '',
        case_count: 3,
      },
    ],
  })
  vi.mocked(api.previewBenchmarkRun).mockResolvedValue(preview())
  // Défaut : aucun run en cours. Le panneau bascule sur Suivi quand il en
  // trouve un, ce qui masquerait l'onglet Lancer.
  vi.mocked(api.getBenchmarkRunProgress).mockResolvedValue(
    progress({ active: false, run_id: null, status: null }),
  )
  vi.mocked(api.startBenchmarkRun).mockResolvedValue({
    run_id: 'run-1',
    status: 'running',
    estimate: preview().estimate,
    model_diagnostics: [],
  })
  vi.mocked(api.listBenchmarkRuns).mockResolvedValue({ runs: [] })
})

afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

async function selectModelAndPreview(interaction: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('checkbox', { name: 'Luna' })
  await interaction.click(screen.getByRole('checkbox', { name: 'Luna' }))
  await interaction.click(screen.getByRole('button', { name: 'Estimer le coût' }))
}

/** Lance le run et fait répondre l'API comme pour un run réellement actif. */
async function launchRun(interaction: ReturnType<typeof userEvent.setup>) {
  vi.mocked(api.getBenchmarkRunProgress).mockResolvedValue(progress())
  await interaction.click(await screen.findByRole('button', { name: /Lancer le run/ }))
  await waitFor(() => expect(api.startBenchmarkRun).toHaveBeenCalled())
}

describe('BenchmarkPanel — aperçu', () => {
  it('affiche la fourchette de coût sans lancer aucun run', async () => {
    const interaction = userEvent.setup()
    render(<BenchmarkPanel />)

    await selectModelAndPreview(interaction)

    expect(await screen.findByText(/0\.1000 \$ à 0\.2500 \$/)).toBeInTheDocument()
    expect(screen.getByText(/3 générations/)).toBeInTheDocument()
    expect(api.previewBenchmarkRun).toHaveBeenCalledTimes(1)
    // Le point entier de l'aperçu : le prix s'affiche avant l'engagement.
    expect(api.startBenchmarkRun).not.toHaveBeenCalled()
  })

  it('interdit le lancement et montre le motif quand le run est refusé', async () => {
    vi.mocked(api.previewBenchmarkRun).mockResolvedValue(
      preview({
        launchable: false,
        blocking_reasons: ['Tarif inconnu pour gpt-5.6-luna : le plafond ne se déclencherait jamais'],
        estimate: {
          generations: 3,
          estimated_min_usd: 0,
          estimated_max_usd: 0,
          unpriced_models: [MODEL_A],
        },
      }),
    )
    const interaction = userEvent.setup()
    render(<BenchmarkPanel />)

    await selectModelAndPreview(interaction)

    expect(await screen.findByText(/Tarif inconnu/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Lancer le run/ })).toBeDisabled()
  })

  it('refuse le lancement quand le plafond est sous l’estimation basse', async () => {
    // Le serveur refuserait le run ; l'aperçu ne peut pas le savoir (le plafond
    // n'existe pas encore quand il chiffre), donc la garde vit ici.
    const interaction = userEvent.setup()
    render(<BenchmarkPanel />)
    await selectModelAndPreview(interaction)

    const cap = await screen.findByLabelText('Plafond budgétaire dur (USD)')
    await interaction.clear(cap)
    await interaction.type(cap, '0.05')

    expect(screen.getByText(/Plafond inférieur à l’estimation basse/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Lancer le run/ })).toBeDisabled()
    expect(api.startBenchmarkRun).not.toHaveBeenCalled()
  })

  it('n’active pas le lancement sur un plafond vide', async () => {
    // `Number('')` vaut NaN, et `NaN <= 0` est faux : la garde naïve laissait
    // passer et produisait un 422 illisible.
    const interaction = userEvent.setup()
    render(<BenchmarkPanel />)
    await selectModelAndPreview(interaction)

    await interaction.clear(await screen.findByLabelText('Plafond budgétaire dur (USD)'))
    expect(screen.getByRole('button', { name: /Lancer le run/ })).toBeDisabled()
  })

  it('affiche le motif exact d’un 409 au lieu du verrou par défaut', async () => {
    // Le backend renvoie 409 pour trois refus distincts ; annoncer « run déjà en
    // cours » enverrait chercher un run concurrent inexistant.
    vi.mocked(api.startBenchmarkRun).mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { detail: 'Tarif inconnu pour gpt-5.6-luna' } },
    })
    const interaction = userEvent.setup()
    render(<BenchmarkPanel />)
    await selectModelAndPreview(interaction)
    await interaction.click(await screen.findByRole('button', { name: /Lancer le run/ }))

    expect(await screen.findByText('Tarif inconnu pour gpt-5.6-luna')).toBeInTheDocument()
  })

  it('signale un modèle inutilisable avant toute dépense', async () => {
    vi.mocked(api.previewBenchmarkRun).mockResolvedValue(
      preview({
        model_diagnostics: [{ model_id: MODEL_A, usable: false, reason: 'Clé API absente' }],
      }),
    )
    const interaction = userEvent.setup()
    render(<BenchmarkPanel />)

    await selectModelAndPreview(interaction)

    expect(await screen.findByText(/inutilisable : Clé API absente/)).toBeInTheDocument()
  })
})

describe('BenchmarkPanel — suivi', () => {
  it('arrête de sonder la progression au démontage', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const interaction = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const view = render(<BenchmarkPanel />)

    await selectModelAndPreview(interaction)
    await launchRun(interaction)

    await vi.advanceTimersByTimeAsync(3100)
    const callsWhileMounted = vi.mocked(api.getBenchmarkRunProgress).mock.calls.length
    expect(callsWhileMounted).toBeGreaterThan(1)

    view.unmount()
    await vi.advanceTimersByTimeAsync(9000)
    // Un intervalle survivant au démontage interrogerait l'API indéfiniment.
    expect(vi.mocked(api.getBenchmarkRunProgress).mock.calls.length).toBe(callsWhileMounted)
  })

  it('cesse de sonder au passage de actif à terminé', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const interaction = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<BenchmarkPanel />)

    await selectModelAndPreview(interaction)
    await launchRun(interaction)

    // Le sondage tourne d'abord — sans cette étape le test resterait vert sur un
    // composant qui ne sonde pas du tout.
    await vi.advanceTimersByTimeAsync(3100)
    const callsWhileRunning = vi.mocked(api.getBenchmarkRunProgress).mock.calls.length
    expect(callsWhileRunning).toBeGreaterThan(1)

    vi.mocked(api.getBenchmarkRunProgress).mockResolvedValue(
      progress({ active: false, status: 'completed', generations_completed: 3 }),
    )
    await vi.advanceTimersByTimeAsync(3100)
    await waitFor(() => expect(screen.getByText(/completed/)).toBeInTheDocument())

    const callsAtRest = vi.mocked(api.getBenchmarkRunProgress).mock.calls.length
    await vi.advanceTimersByTimeAsync(9000)
    expect(vi.mocked(api.getBenchmarkRunProgress).mock.calls.length).toBe(callsAtRest)
    expect(screen.getByRole('button', { name: 'Annuler le run' })).toBeDisabled()
  })

  it('récupère un run déjà en cours au montage, coupure d’urgence comprise', async () => {
    // Sans hydratation au montage, un F5 pendant un run facturé ferait
    // disparaître pause et annulation alors que la dépense continue.
    vi.mocked(api.getBenchmarkRunProgress).mockResolvedValue(
      progress({ run_id: 'run-en-cours' }),
    )
    render(<BenchmarkPanel />)

    const cancel = await screen.findByRole('button', { name: 'Annuler le run' })
    expect(cancel).toBeEnabled()
    await userEvent.setup().click(cancel)
    expect(api.controlBenchmarkRun).toHaveBeenCalledWith('run-en-cours', 'cancel')
  })

  it('bascule Suspendre / Reprendre selon l’état du run', async () => {
    vi.mocked(api.getBenchmarkRunProgress).mockResolvedValue(progress({ paused: true }))
    render(<BenchmarkPanel />)

    const resume = await screen.findByRole('button', { name: 'Reprendre' })
    await userEvent.setup().click(resume)
    expect(api.controlBenchmarkRun).toHaveBeenCalledWith('run-1', 'unpause')
  })

  it('expose la coupure d’urgence tant que le run tourne', async () => {
    const interaction = userEvent.setup()
    render(<BenchmarkPanel />)

    await selectModelAndPreview(interaction)
    await launchRun(interaction)

    const cancel = await screen.findByRole('button', { name: 'Annuler le run' })
    expect(cancel).toBeEnabled()
    await interaction.click(cancel)
    expect(api.controlBenchmarkRun).toHaveBeenCalledWith('run-1', 'cancel')
  })
})

describe('BenchmarkPanel — rapport', () => {
  function report(overrides: Partial<BenchmarkRunReport> = {}): BenchmarkRunReport {
    return {
      run_id: 'run-1',
      suite_id: 'alteir-smoke',
      narration_mode: 'sans',
      repetitions: 1,
      status: 'completed',
      spent_usd: 0.25,
      verdicts_unreadable: false,
      models: [
        {
          model_id: MODEL_A,
          generations: 3,
          valid: 2,
          invalid: 1,
          config_error: 0,
          attempted: 3,
          validity_rate: 0.6667,
          cost_usd: 0.25,
          gate_failures: { connectivity: 1 },
        },
      ],
      judges: [],
      ...overrides,
    }
  }

  beforeEach(() => {
    vi.mocked(api.listBenchmarkRuns).mockResolvedValue({
      runs: [
        {
          run_id: 'run-1',
          identity: {
            suite_id: 'alteir-smoke',
            suite_version: 1,
            suite_fingerprint: 'abc',
            models: [MODEL_A],
            repetitions: 1,
            narration_mode: 'sans',
          },
          status: 'completed',
          generations_total: 3,
          generations_completed: 3,
          spent_usd: 0.25,
          message: '',
        },
      ],
    })
  })

  it('affiche la validité et dit explicitement qu’un run n’est pas noté', async () => {
    vi.mocked(api.getBenchmarkRunReport).mockResolvedValue(report())
    const interaction = userEvent.setup()
    render(<BenchmarkPanel />)

    await interaction.click(await screen.findByRole('button', { name: 'Rapport' }))
    await interaction.click(await screen.findByRole('button', { name: 'Afficher le rapport' }))

    expect(await screen.findByText('66,7 %')).toBeInTheDocument()
    expect(screen.getByText('connectivity ×1')).toBeInTheDocument()
    expect(
      screen.getByText(/n’a pas encore été noté/),
    ).toBeInTheDocument()
  })

  it('écrit « non noté » plutôt qu’un zéro quand aucune note n’existe', async () => {
    vi.mocked(api.getBenchmarkRunReport).mockResolvedValue(
      report({
        judges: [
          {
            judge_model: 'gpt-5.6-sol',
            grid_id: 'grille-dialogue-fr',
            grid_version: 1,
            models: [
              {
                model_id: MODEL_A,
                scored_count: 0,
                judge_errors: 2,
                weighted_mean: null,
                criteria: [],
              },
            ],
            pairwise: [],
            pairwise_decided: 0,
            pairwise_judge_errors: 0,
            position_disagreement_rate: 0,
          },
        ],
      }),
    )
    const interaction = userEvent.setup()
    render(<BenchmarkPanel />)

    await interaction.click(await screen.findByRole('button', { name: 'Rapport' }))
    await interaction.click(await screen.findByRole('button', { name: 'Afficher le rapport' }))

    expect(await screen.findByText('non noté')).toBeInTheDocument()
  })

  it('affiche le mode de narration, qui interdit de comparer deux runs', async () => {
    vi.mocked(api.getBenchmarkRunReport).mockResolvedValue(report({ narration_mode: 'avec' }))
    const interaction = userEvent.setup()
    render(<BenchmarkPanel />)

    await interaction.click(await screen.findByRole('button', { name: 'Rapport' }))
    await interaction.click(await screen.findByRole('button', { name: 'Afficher le rapport' }))

    expect(await screen.findByText(/mode « avec »/)).toBeInTheDocument()
  })

  it('n’efface pas les duels d’un run jugé sans passe rubrique', async () => {
    vi.mocked(api.getBenchmarkRunReport).mockResolvedValue(
      report({
        judges: [
          {
            judge_model: 'gpt-5.6-sol',
            grid_id: 'grille-dialogue-fr',
            grid_version: 1,
            models: [],
            pairwise: [
              { model_id: MODEL_A, wins: 4, losses: 1, ties: 2, win_rate: 0.5714 },
            ],
            pairwise_decided: 3,
            pairwise_judge_errors: 0,
            position_disagreement_rate: 0.004,
          },
        ],
      }),
    )
    const interaction = userEvent.setup()
    render(<BenchmarkPanel />)

    await interaction.click(await screen.findByRole('button', { name: 'Rapport' }))
    await interaction.click(await screen.findByRole('button', { name: 'Afficher le rapport' }))

    expect(await screen.findByText('4/2/1')).toBeInTheDocument()
    // Un biais de position réel ne doit pas s'arrondir à « 0 % ».
    expect(screen.getByText(/< 0,5 %/)).toBeInTheDocument()
  })

  it('distingue une erreur de configuration d’un recalage de qualité', async () => {
    vi.mocked(api.getBenchmarkRunReport).mockResolvedValue(
      report({
        models: [
          {
            model_id: MODEL_A,
            generations: 3,
            valid: 0,
            invalid: 0,
            config_error: 3,
            attempted: 0,
            validity_rate: 0,
            cost_usd: 0,
            gate_failures: {},
          },
        ],
      }),
    )
    const interaction = userEvent.setup()
    render(<BenchmarkPanel />)

    await interaction.click(await screen.findByRole('button', { name: 'Rapport' }))
    await interaction.click(await screen.findByRole('button', { name: 'Afficher le rapport' }))

    // « 0 % » ferait lire « ce modèle écrit mal » là où il n'a rien écrit.
    expect(await screen.findByText('aucune tentative')).toBeInTheDocument()
  })

  it('sépare les blocs de deux juges au lieu de les fondre', async () => {
    const judge = (name: string, mean: number) => ({
      judge_model: name,
      grid_id: 'grille-dialogue-fr',
      grid_version: 1,
      models: [
        {
          model_id: MODEL_A,
          scored_count: 3,
          judge_errors: 0,
          weighted_mean: mean,
          criteria: [],
        },
      ],
      pairwise: [],
      pairwise_decided: 0,
      pairwise_judge_errors: 0,
      position_disagreement_rate: 0,
    })
    vi.mocked(api.getBenchmarkRunReport).mockResolvedValue(
      report({ judges: [judge('gpt-5.6-sol', 7.5), judge('gpt-5.6-terra', 5.25)] }),
    )
    const interaction = userEvent.setup()
    render(<BenchmarkPanel />)

    await interaction.click(await screen.findByRole('button', { name: 'Rapport' }))
    await interaction.click(await screen.findByRole('button', { name: 'Afficher le rapport' }))

    expect(await screen.findByText(/Juge gpt-5\.6-sol/)).toBeInTheDocument()
    expect(screen.getByText(/Juge gpt-5\.6-terra/)).toBeInTheDocument()
    expect(screen.getByText('7.50')).toBeInTheDocument()
    expect(screen.getByText('5.25')).toBeInTheDocument()
  })
})
