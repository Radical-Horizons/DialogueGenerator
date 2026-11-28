/**
 * Tons, profil d'auteur et mentions partent avec les générations du dialogue ouvert
 * (story 20.4 lot B). Le lot en job est couvert par `useBatchGenerateFromNodes.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useGraphStore } from '../store/graphStore'
import { useAuthStore } from '../store/authStore'
import { useGenerationStore } from '../store/generationStore'
import { useSceneCatalogStore } from '../store/sceneCatalogStore'
import { useSceneProfileStore } from '../store/sceneProfileStore'
import { toastManager } from '../components/shared/Toast'
import * as graphAPI from '../api/graph'
import * as authorProfilesAPI from '../api/authorProfiles'
import { AIGenerationPanel } from '../components/graph/AIGenerationPanel'
import { SceneContextLine } from '../components/scene/SceneContextLine'
import type { EstimateCostRequest } from '../types/graph'
import type { SceneSheet } from '../utils/sceneSheet'

vi.mock('../api/graph', () => ({
  generateNode: vi.fn(),
  regenerateNode: vi.fn(),
  detectContextDropping: vi.fn(),
}))
vi.mock('../api/authorProfiles', () => ({
  listAuthorProfilesApi: vi.fn(),
  listPrebuiltAuthorProfilesApi: vi.fn(),
}))
vi.mock('../api/config', () => ({
  listLLMModels: vi.fn().mockResolvedValue({ models: [], total: 0 }),
}))
vi.mock('../hooks/useCostGovernance', () => ({
  useCostGovernance: () => ({ checkBudget: vi.fn(), isBlocked: false }),
}))
const estimates: Array<EstimateCostRequest | null> = []
vi.mock('../components/graph/CostEstimationBadge', () => ({
  CostEstimationBadge: ({ estimateRequest }: { estimateRequest: EstimateCostRequest | null }) => {
    estimates.push(estimateRequest)
    return null
  },
}))

const INITIAL_AUTH = useAuthStore.getState()
const PROFILE_TEXT = 'Répliques mesurées, d’une à trois phrases.'

function sheet(patch: Partial<SceneSheet> = {}): SceneSheet {
  return {
    npcs: [{ name: 'Korga', entryId: null }],
    pc: { name: 'Vethraak', entryId: null },
    place: null,
    brief: '',
    linkedEntries: [],
    ...patch,
  }
}

function openDialogue(scene: SceneSheet) {
  useGraphStore.setState({
    documentId: 'forge',
    scene,
    nodes: [
      {
        id: 'START',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { id: 'START', speaker: 'Korga', line: '…', choices: [] },
      },
      {
        id: 'node-1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { id: 'node-1', speaker: 'Korga', line: '…', choices: [] },
      },
    ],
    edges: [{ id: 'e', source: 'START', target: 'node-1' }],
  })
}

const generated = () => vi.mocked(graphAPI.generateNode).mock.calls[0][0]
const regenerated = () => vi.mocked(graphAPI.regenerateNode).mock.calls[0][1]

beforeEach(() => {
  vi.clearAllMocks()
  estimates.length = 0
  vi.restoreAllMocks()
  useAuthStore.setState(INITIAL_AUTH, true)
  useGraphStore.getState().resetGraph()
  useGenerationStore.getState().setContextDroppingRulesOverlay(null)
  useSceneCatalogStore.setState({
    characters: [{ name: 'Korga', data: {} }],
    places: [],
    items: [{ name: 'Anneau de Vœu', data: {} }],
    species: [],
    communities: [],
  })
  useSceneProfileStore.setState({ voices: [], status: 'idle' })
  vi.mocked(authorProfilesAPI.listAuthorProfilesApi).mockResolvedValue([])
  vi.mocked(authorProfilesAPI.listPrebuiltAuthorProfilesApi).mockResolvedValue([
    { id: 'sobre', name: 'Sobre', description: 'Mesuré.', content: PROFILE_TEXT },
  ])
  vi.mocked(graphAPI.generateNode).mockResolvedValue({
    node: { id: 'node-gen', speaker: 'Korga', line: '« Bien. »' },
    suggested_connections: [],
    parent_node_id: 'node-1',
  })
  vi.mocked(graphAPI.regenerateNode).mockResolvedValue({
    node: { id: 'node-1', speaker: 'Korga', line: '« Autre. »' },
    suggested_connections: [],
  })
})

describe('génération du dialogue ouvert', () => {
  it('suite : tons et texte du profil, attendu avant l’envoi ; mention sans son @', async () => {
    let release!: () => void
    vi.mocked(authorProfilesAPI.listPrebuiltAuthorProfilesApi).mockReturnValue(
      new Promise((resolve) => {
        release = () =>
          resolve([{ id: 'sobre', name: 'Sobre', description: '', content: PROFILE_TEXT }])
      }),
    )
    openDialogue(
      sheet({
        tones: ['tension', 'murmuré'],
        authorProfileId: 'sobre',
        brief: 'Il montre @Anneau de Vœu à @xyz.',
      }),
    )

    const pending = useGraphStore.getState().generateFromNode('node-1', 'Suite', {})
    await Promise.resolve()
    expect(graphAPI.generateNode).not.toHaveBeenCalled()
    release()
    await pending

    expect(generated().narrative_tags).toEqual(['tension', 'murmuré'])
    expect(generated().author_profile).toBe(PROFILE_TEXT)
    expect(generated().user_instructions).toBe(
      'Brief de la scène : Il montre Anneau de Vœu à @xyz.\n\nSuite',
    )
  })

  it('régénération : mêmes champs', async () => {
    openDialogue(sheet({ tones: ['intime'], authorProfileId: 'sobre' }))

    await useGraphStore.getState().regenerateNode('node-1', 'Plus court')

    expect(regenerated().narrative_tags).toEqual(['intime'])
    expect(regenerated().author_profile).toBe(PROFILE_TEXT)
  })

  it('sans ton ni profil : champs absents et aucune lecture des profils', async () => {
    openDialogue(sheet({ tones: [] }))

    await useGraphStore.getState().generateFromNode('node-1', 'Suite', {})

    expect(generated().narrative_tags).toBeUndefined()
    expect(generated().author_profile).toBeUndefined()
    expect(authorProfilesAPI.listAuthorProfilesApi).not.toHaveBeenCalled()
  })

  it('profil introuvable : avertissement, envoi sans author_profile', async () => {
    const warn = vi.spyOn(toastManager, 'show')
    openDialogue(sheet({ authorProfileId: 'supprimé' }))

    await useGraphStore.getState().generateFromNode('node-1', 'Suite', {})

    expect(generated().author_profile).toBeUndefined()
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('introuvable'),
      'warning',
      expect.any(Number),
    )
  })
})

describe('relecture des profils', () => {
  const voice = (content: string) => [{ id: 'sobre', name: 'Sobre', description: '', content }]
  const send = () => useGraphStore.getState().generateFromNode('node-1', 'Suite', {})

  it('une liste en échec après une lecture réussie : le texte connu part encore', async () => {
    await useSceneProfileStore.getState().load()
    vi.mocked(authorProfilesAPI.listPrebuiltAuthorProfilesApi).mockRejectedValue(new Error('hs'))
    openDialogue(sheet({ authorProfileId: 'sobre' }))

    await send()

    expect(generated().author_profile).toBe(PROFILE_TEXT)
  })

  it('une liste relue ne garde pas un profil qu’elle n’a plus', async () => {
    vi.mocked(authorProfilesAPI.listAuthorProfilesApi).mockResolvedValue([
      {
        id: 'privé',
        name: 'Privé',
        description: '',
        content: 'Secret.',
        metadata: { created: '', modified: '' },
        visibility: 'private',
      },
    ])
    await useSceneProfileStore.getState().load()
    vi.mocked(authorProfilesAPI.listAuthorProfilesApi).mockResolvedValue([])
    vi.mocked(authorProfilesAPI.listPrebuiltAuthorProfilesApi).mockRejectedValue(new Error('hs'))

    await useSceneProfileStore.getState().load()

    expect(useSceneProfileStore.getState().voices.map((item) => item.id)).toEqual(['sobre'])
  })

  it('première lecture en échec : « indisponible », pas « introuvable »', async () => {
    const warn = vi.spyOn(toastManager, 'show')
    vi.mocked(authorProfilesAPI.listPrebuiltAuthorProfilesApi).mockRejectedValue(new Error('hs'))
    openDialogue(sheet({ authorProfileId: 'sobre' }))

    await send()
    render(<SceneContextLine />)

    expect(generated().author_profile).toBeUndefined()
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('indisponible'),
      'warning',
      expect.any(Number),
    )
    await waitFor(() =>
      expect(screen.getByRole('group', { name: 'Ce que le modèle saura' })).toHaveTextContent(
        'profil indisponible',
      ),
    )
    expect(screen.queryByText(/introuvable/)).not.toBeInTheDocument()
  })

  it('profil au texte vide : « sans texte »', async () => {
    const warn = vi.spyOn(toastManager, 'show')
    vi.mocked(authorProfilesAPI.listPrebuiltAuthorProfilesApi).mockResolvedValue(voice('  '))
    openDialogue(sheet({ authorProfileId: 'sobre' }))

    await send()
    render(<SceneContextLine />)

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('sans texte'),
      'warning',
      expect.any(Number),
    )
    expect(screen.getByRole('group', { name: 'Ce que le modèle saura' })).toHaveTextContent(
      'profil sans texte',
    )
  })

  it('un texte modifié depuis la dernière lecture est celui qui part', async () => {
    await useSceneProfileStore.getState().load()
    vi.mocked(authorProfilesAPI.listPrebuiltAuthorProfilesApi).mockResolvedValue(voice('Révisé.'))
    openDialogue(sheet({ authorProfileId: 'sobre' }))

    await send()

    expect(generated().author_profile).toBe('Révisé.')
  })
})

describe('panneau de génération IA', () => {
  it('ses puces sont les tons de la fiche et l’estimation les porte avec le profil', async () => {
    openDialogue(sheet({ tones: ['tension'], authorProfileId: 'sobre' }))
    render(<AIGenerationPanel parentNodeId="node-1" onClose={() => {}} />)

    expect(screen.getByRole('button', { name: 'tension' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'menace' }))

    expect(useGraphStore.getState().scene?.tones).toEqual(['tension', 'menace'])
    expect(useGraphStore.getState().sceneDirty).toBe(true)
    await waitFor(() => expect(estimates.at(-1)?.author_profile).toBe(PROFILE_TEXT))
    expect(estimates.at(-1)?.narrative_tags).toEqual(['tension', 'menace'])
  })
})
