/**
 * Comparaison multi-options (écran 2b) : une seule option ouverte, diagnostic,
 * Garder / Variante / Déplier / Régénérer le lot.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { GenerateUnityDialogueRequest, GenerateUnityDialogueResponse } from '../../types/api'

vi.mock('../../api/dialogues', () => ({
  createGenerationJob: vi.fn().mockResolvedValue({
    job_id: 'job-x',
    stream_url: '/stream',
    status: 'queued',
  }),
  cancelGenerationJob: vi.fn().mockResolvedValue({ success: true }),
}))

const setUnityDialogueResponse = vi.fn()
/** Contenu du panneau droit (« Garder et continuer ») vu par la comparaison. */
let mockPanelResponse: GenerateUnityDialogueResponse | null = null
vi.mock('../../store/generationStore', () => ({
  useGenerationStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ setUnityDialogueResponse, unityDialogueResponse: mockPanelResponse }),
}))

let mockSelections: Record<string, string[]> = { characters: [], locations: [] }
vi.mock('../../store/contextStore', () => ({
  useContextStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ selections: mockSelections }),
}))

import { useGenerationOptionsStore } from '../../store/generationOptionsStore'
import { useUiLayoutStore } from '../../store/uiLayoutStore'
import { GenerationOptionsComparison } from './GenerationOptionsComparison'

const REQUEST = { user_instructions: 'x' } as GenerateUnityDialogueRequest

function makeResult(line: string, choices = 2): GenerateUnityDialogueResponse {
  return {
    // Forme réelle de la génération : tableau nu de nœuds (`render_unity_nodes`).
    json_content: JSON.stringify([
      {
        id: 'START',
        speaker: 'PNJ',
        line,
        choices: Array.from({ length: choices }, (_, i) => ({ text: `choix ${i}` })),
      },
    ]),
    raw_prompt: '' as unknown as GenerateUnityDialogueResponse['raw_prompt'],
    prompt_hash: 'h',
    estimated_tokens: 10,
  }
}

/** EventSource factice minimal pour les relances Variante. */
class NoopEventSource {
  onmessage: unknown = null
  onerror: unknown = null
  readyState = 0
  close() {}
}

/** Comme en vrai : l'option 1, streamée par le pipeline principal, occupe déjà le panneau. */
function startTwoReadyOptions() {
  const main = makeResult('Première réplique.')
  mockPanelResponse = main
  useGenerationOptionsStore.getState().startRun(2, REQUEST)
  useGenerationOptionsStore.getState().updateSlot(0, { status: 'completed', result: main })
  useGenerationOptionsStore
    .getState()
    .updateSlot(1, { status: 'completed', result: makeResult('Seconde réplique.') })
}

describe('GenerationOptionsComparison', () => {
  beforeEach(() => {
    vi.stubGlobal('EventSource', NoopEventSource as unknown as typeof EventSource)
    setUnityDialogueResponse.mockClear()
    mockPanelResponse = null
    mockSelections = { characters: [], locations: [] }
    useGenerationOptionsStore.setState({
      optionCount: 2,
      slots: [],
      lastRequest: REQUEST,
      keptIndex: null,
    })
  })

  it('ne rend rien hors run multi-options', () => {
    render(<GenerationOptionsComparison />)
    expect(screen.queryByTestId('generation-options-comparison')).toBeNull()
  })

  it('affiche la progression EN ÉCRITURE puis À COMPARER', () => {
    useGenerationOptionsStore.getState().startRun(2, REQUEST)
    useGenerationOptionsStore.getState().updateSlot(0, { status: 'running' })
    const { rerender } = render(<GenerationOptionsComparison />)
    expect(screen.getByTestId('options-progress-label')).toHaveTextContent(
      'OPTION 1 SUR 2 — EN ÉCRITURE'
    )

    startTwoReadyOptions()
    rerender(<GenerationOptionsComparison />)
    expect(screen.getByTestId('options-progress-label')).toHaveTextContent(
      '2 OPTIONS SUR 2 — À COMPARER'
    )
  })

  it('n’ouvre qu’une option à la fois : les autres portent « Déplier »', () => {
    startTwoReadyOptions()
    render(<GenerationOptionsComparison />)

    expect(screen.getByTestId('generation-option-0')).toHaveAttribute('data-open', 'true')
    expect(screen.getByTestId('generation-option-1')).toHaveAttribute('data-open', 'false')
    // Les actions primaires n'existent que sur l'option ouverte.
    expect(screen.getByTestId('option-keep-0')).toBeInTheDocument()
    expect(screen.queryByTestId('option-keep-1')).toBeNull()
    expect(screen.getByTestId('option-expand-1')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('option-expand-1'))
    expect(screen.getByTestId('generation-option-1')).toHaveAttribute('data-open', 'true')
    expect(screen.getByTestId('generation-option-0')).toHaveAttribute('data-open', 'false')
    expect(screen.getByTestId('option-keep-1')).toBeInTheDocument()
  })

  it('« tout replier » ferme l’option ouverte et masque le diagnostic', () => {
    startTwoReadyOptions()
    render(<GenerationOptionsComparison />)
    expect(screen.getByTestId('option-diagnostic-column')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('options-collapse-all'))
    expect(screen.getByTestId('generation-option-0')).toHaveAttribute('data-open', 'false')
    expect(screen.queryByTestId('option-diagnostic-column')).toBeNull()
  })

  it('Garder pousse le résultat de l’option ouverte dans le store de génération', () => {
    startTwoReadyOptions()
    render(<GenerationOptionsComparison />)

    fireEvent.click(screen.getByTestId('option-keep-0'))
    expect(setUnityDialogueResponse).toHaveBeenCalledTimes(1)
    expect(useGenerationOptionsStore.getState().keptIndex).toBe(0)
  })

  it('Variante relance uniquement cette option', () => {
    startTwoReadyOptions()
    render(<GenerationOptionsComparison />)

    fireEvent.click(screen.getByTestId('option-variant-0'))
    expect(['pending', 'running']).toContain(useGenerationOptionsStore.getState().slots[0].status)
    // L'autre option n'est pas touchée.
    expect(useGenerationOptionsStore.getState().slots[1].status).toBe('completed')
  })

  it('« Régénérer les N » relance tout le lot', () => {
    startTwoReadyOptions()
    render(<GenerationOptionsComparison />)

    fireEvent.click(screen.getByTestId('options-regenerate-all'))
    const slots = useGenerationOptionsStore.getState().slots
    expect(slots.every((s) => s.status === 'pending' || s.status === 'running')).toBe(true)
  })

  it('le diagnostic ne compte que les fiches réellement citées', () => {
    mockSelections = { characters: ['Vessine Dhalgo', 'Orsenne Kaladh'], locations: [] }
    useGenerationOptionsStore.getState().startRun(2, REQUEST)
    useGenerationOptionsStore
      .getState()
      .updateSlot(0, { status: 'completed', result: makeResult('Vessine Dhalgo entre.') })
    useGenerationOptionsStore
      .getState()
      .updateSlot(1, { status: 'completed', result: makeResult('Rien de nommé.') })
    render(<GenerationOptionsComparison />)

    expect(screen.getByText('Vessine Dhalgo')).toBeInTheDocument()
    // La seconde fiche envoyée n'apparaît pas dans le texte : signalée comme inutile.
    expect(screen.getByTestId('diagnostic-uncited')).toHaveTextContent('1 fiche envoyée')
  })

  it('une option en erreur propose Réessayer sans bloquer les autres', () => {
    useGenerationOptionsStore.getState().startRun(2, REQUEST)
    useGenerationOptionsStore
      .getState()
      .updateSlot(0, { status: 'completed', result: makeResult('Ça marche.') })
    useGenerationOptionsStore.getState().updateSlot(1, { status: 'error', error: 'boom' })
    render(<GenerationOptionsComparison />)

    expect(screen.getByText('boom')).toBeInTheDocument()
    expect(screen.getByTestId('option-retry-1')).toBeInTheDocument()
    expect(screen.getByTestId('option-keep-0')).toBeInTheDocument()
  })
})

describe('GenerationOptionsComparison — vue côte à côte', () => {
  /** La bascule n'existe que si chaque option garde une colonne lisible : on fixe la largeur. */
  const renderAt = (widthPx: number) =>
    render(
      <div style={{ width: `${widthPx}px` }}>
        <GenerationOptionsComparison />
      </div>
    )

  beforeEach(() => {
    vi.stubGlobal('EventSource', NoopEventSource as unknown as typeof EventSource)
    setUnityDialogueResponse.mockClear()
    mockPanelResponse = null
    mockSelections = { characters: [], locations: [] }
    useUiLayoutStore.setState({ optionsView: 'list' })
    useGenerationOptionsStore.setState({
      optionCount: 2,
      slots: [],
      lastRequest: REQUEST,
      keptIndex: null,
    })
    startTwoReadyOptions()
  })

  it('propose Liste / Côte à côte, la liste par défaut', () => {
    renderAt(1200)
    expect(screen.getByTestId('options-view-list')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('options-view-columns')).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByTestId('generation-options-comparison')).toHaveAttribute('data-view', 'list')
  })

  it('aligne les options en colonnes et masque la colonne Diagnostic', () => {
    renderAt(1200)
    fireEvent.click(screen.getByTestId('options-view-columns'))

    expect(screen.getByTestId('options-columns')).toBeInTheDocument()
    expect(screen.getByTestId('options-column-head-0')).toBeInTheDocument()
    expect(screen.getByTestId('options-column-head-1')).toBeInTheDocument()
    expect(screen.getByTestId('options-cell-line-0')).toHaveTextContent('Première réplique.')
    expect(screen.getByTestId('options-cell-line-1')).toHaveTextContent('Seconde réplique.')
    // Régression : un tag de test sans espace débordait sur la colonne voisine.
    expect(screen.getByTestId('options-cell-choices-0').style.overflowWrap).toBe('anywhere')
    expect(screen.queryByTestId('option-diagnostic-column')).not.toBeInTheDocument()
    expect(screen.queryByTestId('options-collapse-all')).not.toBeInTheDocument()
    // La préférence survit au lot suivant : elle vit dans le store de disposition.
    expect(useUiLayoutStore.getState().optionsView).toBe('columns')
  })

  it('seule la colonne retenue porte « Garder » ; « Retenir » déplace le bouton plein', () => {
    useUiLayoutStore.setState({ optionsView: 'columns' })
    renderAt(1200)

    expect(screen.getByTestId('options-column-head-0')).toHaveAttribute('data-retained', 'true')
    expect(screen.getByTestId('option-keep-0')).toBeInTheDocument()
    expect(screen.queryByTestId('option-keep-1')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('option-retain-1'))

    expect(screen.getByTestId('options-column-head-1')).toHaveAttribute('data-retained', 'true')
    expect(screen.getByTestId('option-keep-1')).toBeInTheDocument()
    expect(screen.queryByTestId('option-keep-0')).not.toBeInTheDocument()
  })

  it('« Garder » en colonnes pousse le résultat de la colonne retenue', () => {
    useUiLayoutStore.setState({ optionsView: 'columns' })
    renderAt(1200)
    fireEvent.click(screen.getByTestId('option-retain-1'))
    fireEvent.click(screen.getByTestId('option-keep-1'))

    const slot1 = useGenerationOptionsStore.getState().slots[1]
    expect(setUnityDialogueResponse).toHaveBeenCalledWith(slot1.result)
    expect(useGenerationOptionsStore.getState().keptIndex).toBe(1)
  })

  it('colonne trop étroite : pas de bascule, la liste s’impose même si la préférence est côte à côte', () => {
    useUiLayoutStore.setState({ optionsView: 'columns' })
    renderAt(320)

    expect(screen.queryByTestId('options-view-columns')).not.toBeInTheDocument()
    expect(screen.queryByTestId('options-columns')).not.toBeInTheDocument()
    expect(screen.getByTestId('generation-options-comparison')).toHaveAttribute('data-view', 'list')
  })
})

describe('GenerationOptionsComparison — panneau droit', () => {
  beforeEach(() => {
    vi.stubGlobal('EventSource', NoopEventSource as unknown as typeof EventSource)
    setUnityDialogueResponse.mockClear()
    mockPanelResponse = null
    mockSelections = { characters: [], locations: [] }
    useUiLayoutStore.setState({ optionsView: 'list' })
    useGenerationOptionsStore.setState({
      optionCount: 2,
      slots: [],
      lastRequest: REQUEST,
      keptIndex: null,
    })
  })

  it('suit l’option retenue : « Garder et continuer » ne sauvegarde plus l’option 1 à sa place (régression)', () => {
    startTwoReadyOptions()
    render(<GenerationOptionsComparison />)
    expect(setUnityDialogueResponse).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('option-expand-1'))

    expect(setUnityDialogueResponse).toHaveBeenCalledWith(useGenerationOptionsStore.getState().slots[1].result)
  })

  it('n’écrase jamais un panneau que l’auteur a modifié', () => {
    startTwoReadyOptions()
    mockPanelResponse = { ...(mockPanelResponse as GenerateUnityDialogueResponse), json_content: '[{"id":"START"}]' }
    render(<GenerationOptionsComparison />)

    fireEvent.click(screen.getByTestId('option-expand-1'))

    expect(setUnityDialogueResponse).not.toHaveBeenCalled()
  })

  it('attend la fin du stream principal : le slot 0 se remplit depuis ce même panneau', () => {
    mockPanelResponse = null
    useGenerationOptionsStore.getState().startRun(2, REQUEST)
    useGenerationOptionsStore.getState().updateSlot(0, { status: 'running' })
    useGenerationOptionsStore
      .getState()
      .updateSlot(1, { status: 'completed', result: makeResult('Arrivée la première.') })
    render(<GenerationOptionsComparison />)

    expect(setUnityDialogueResponse).not.toHaveBeenCalled()
  })

  it('une option gardée fixe le panneau : en déplier une autre ne la remplace pas', () => {
    startTwoReadyOptions()
    render(<GenerationOptionsComparison />)
    fireEvent.click(screen.getByTestId('option-keep-0'))
    setUnityDialogueResponse.mockClear()

    fireEvent.click(screen.getByTestId('option-expand-1'))

    expect(setUnityDialogueResponse).not.toHaveBeenCalled()
  })
})
