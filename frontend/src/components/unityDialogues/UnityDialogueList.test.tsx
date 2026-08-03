/**
 * Liste Unity — layout compact + typo titre explicite (plan liste responsive).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as unityDialoguesAPI from '../../api/unityDialogues'
import * as dialoguesAPI from '../../api/dialogues'
import * as documentsAPI from '../../api/documents'
import { UnityDialogueList } from './UnityDialogueList'

vi.mock('../../api/unityDialogues', () => ({
  listUnityDialogues: vi.fn(),
}))

vi.mock('../../api/dialogues', () => ({
  validateDocumentSchema: vi.fn(),
  batchExportUnityDialogues: vi.fn(),
}))

vi.mock('../../api/documents', () => ({
  putDocument: vi.fn(),
}))

const mockList = vi.mocked(unityDialoguesAPI.listUnityDialogues)
const mockValidateDocumentSchema = vi.mocked(dialoguesAPI.validateDocumentSchema)

describe('UnityDialogueList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockList.mockResolvedValue({
      dialogues: [
        {
          filename: 'test_dialogue.json',
          file_path: '/data/test_dialogue.json',
          modified_time: '2026-04-08T12:00:00.000Z',
          size_bytes: 1024,
          title: 'Titre API',
          share_count: 0,
          capabilities: {
            can_read: true,
            can_edit: true,
            can_delete: true,
            is_owner: true,
          },
        },
      ],
      total: 1,
    })
    vi.mocked(documentsAPI.putDocument).mockResolvedValue({ revision: 1 })
  })

  it('applique une fontSize explicite au titre dans un conteneur étroit (régression héritage 16px)', async () => {
    render(
      <div style={{ width: 360 }}>
        <UnityDialogueList onSelectDialogue={() => {}} selectedFilename={null} />
      </div>
    )

    await waitFor(() => {
      expect(screen.getByTestId('unity-dialogue-list')).toBeInTheDocument()
    })

    const titleEl = screen.getByTestId('unity-dialogue-item-title')
    expect(titleEl).toHaveStyle({ fontSize: '0.8rem' })
    expect(titleEl).toHaveTextContent('Titre API')
  })

  it('affiche le badge Privé quand aucun co-éditeur n’existe', async () => {
    render(<UnityDialogueList onSelectDialogue={() => {}} selectedFilename={null} />)

    const badge = await screen.findByTestId('unity-dialogue-sharing-badge')
    expect(badge).toHaveTextContent('Privé')
    expect(badge).toHaveAttribute('title', 'Privé')
  })

  it('affiche le nombre de co-éditeurs dans le badge et son tooltip', async () => {
    mockList.mockResolvedValueOnce({
      dialogues: [
        {
          filename: 'shared.json',
          file_path: '/data/shared.json',
          modified_time: '2026-04-08T12:00:00.000Z',
          size_bytes: 1024,
          title: 'Partagé',
          share_count: 2,
        },
      ],
      total: 1,
    })
    render(<UnityDialogueList onSelectDialogue={() => {}} selectedFilename={null} />)

    const badge = await screen.findByTestId('unity-dialogue-sharing-badge')
    expect(badge).toHaveTextContent('Co-édité (2)')
    expect(badge).toHaveAttribute('title', 'Co-édité (2)')
  })

  it('ouvre un menu contextuel au clic droit avec supprimer le dialogue', async () => {
    const user = userEvent.setup()
    render(<UnityDialogueList onSelectDialogue={() => {}} selectedFilename={null} />)

    const item = await screen.findByTestId('unity-dialogue-item')
    await user.pointer({ keys: '[MouseRight>]', target: item })
    await user.pointer({ keys: '[/MouseRight]' })

    expect(screen.getByTestId('dialogue-list-context-menu')).toBeInTheDocument()
    expect(screen.getByTestId('dialogue-list-context-delete')).toHaveTextContent(
      'Supprimer le dialogue',
    )
    expect(screen.getByTestId('dialogue-list-context-validate-schema')).toHaveTextContent(
      'Valider le schéma Unity',
    )
  })

  it('lance validateDocumentSchema depuis le menu contextuel', async () => {
    const user = userEvent.setup()
    mockValidateDocumentSchema.mockResolvedValue({
      is_valid: true,
      errors: [],
      error_count: 0,
      warnings: [],
      structured_errors: [],
    })
    render(<UnityDialogueList onSelectDialogue={() => {}} selectedFilename={null} />)

    const item = await screen.findByTestId('unity-dialogue-item')
    await user.pointer({ keys: '[MouseRight>]', target: item })
    await user.pointer({ keys: '[/MouseRight]' })
    await user.click(screen.getByTestId('dialogue-list-context-validate-schema'))

    await waitFor(() => {
      expect(mockValidateDocumentSchema).toHaveBeenCalledWith('test_dialogue')
    })
    expect(screen.getByTestId('schema-validation-panel')).toBeInTheDocument()
  })

  it('compare la sélection avec ou sans extension .json', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<UnityDialogueList onSelectDialogue={onSelect} selectedFilename="test_dialogue" />)

    const item = await screen.findByTestId('unity-dialogue-item')
    expect(item).toHaveAttribute('aria-pressed', 'true')

    await user.click(item.querySelector('button') ?? item)
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('affiche le nombre de nœuds dans un item enrichi', async () => {
    mockList.mockResolvedValueOnce({
      dialogues: [
        {
          filename: 'enrichi.json',
          file_path: '/data/enrichi.json',
          modified_time: '2026-04-08T12:00:00.000Z',
          created_at: '2026-04-01T09:00:00.000Z',
          size_bytes: 2048,
          node_count: 3,
          title: 'Enrichi',
          share_count: 0,
        },
      ],
      total: 1,
    })
    render(<UnityDialogueList onSelectDialogue={() => {}} selectedFilename={null} />)

    const nodeCount = await screen.findByTestId('unity-dialogue-item-node-count')
    expect(nodeCount).toHaveTextContent('3 nœuds')
    expect(screen.getByTestId('unity-dialogue-item-created')).toHaveTextContent('créé')
  })

  it('affiche les personnages et filtre par personnage (FR81)', async () => {
    const user = userEvent.setup()
    mockList.mockResolvedValueOnce({
      dialogues: [
        {
          filename: 'uresair.json',
          file_path: '/data/uresair.json',
          modified_time: '2026-04-08T12:00:00.000Z',
          size_bytes: 1024,
          title: 'Rencontre',
          speakers: ['Uresaïr', 'Voknir'],
          search_text: 'bonjour',
          share_count: 0,
        },
        {
          filename: 'luna.json',
          file_path: '/data/luna.json',
          modified_time: '2026-04-07T12:00:00.000Z',
          size_bytes: 1024,
          title: 'Autre',
          speakers: ['Luna'],
          search_text: 'salut',
          share_count: 0,
        },
      ],
      total: 2,
    })
    render(<UnityDialogueList onSelectDialogue={() => {}} selectedFilename={null} />)

    const speakers = await screen.findAllByTestId('unity-dialogue-item-speakers')
    expect(speakers[0]).toHaveTextContent('Uresaïr, Voknir')
    expect(screen.getAllByTestId('unity-dialogue-item')).toHaveLength(2)

    await user.type(screen.getByPlaceholderText('Rechercher… (/)'), 'voknir')

    await waitFor(() => {
      expect(screen.getAllByTestId('unity-dialogue-item')).toHaveLength(1)
    })
    expect(screen.getByTestId('unity-dialogue-item-title')).toHaveTextContent('Rencontre')
  })

  it('filtre par auteur via le select et retire le badge (FR82)', async () => {
    const user = userEvent.setup()
    mockList.mockResolvedValueOnce({
      dialogues: [
        {
          filename: 'a.json',
          file_path: '/data/a.json',
          modified_time: '2026-04-08T12:00:00.000Z',
          created_at: '2026-04-08T12:00:00.000Z',
          size_bytes: 1024,
          title: 'De Marc',
          owner_id: 'u-marc',
          owner_username: 'marc',
          share_count: 0,
        },
        {
          filename: 'b.json',
          file_path: '/data/b.json',
          modified_time: '2026-04-07T12:00:00.000Z',
          created_at: '2026-04-07T12:00:00.000Z',
          size_bytes: 1024,
          title: 'De Luna',
          owner_id: 'u-luna',
          owner_username: 'luna',
          share_count: 0,
        },
      ],
      total: 2,
    })
    render(<UnityDialogueList onSelectDialogue={() => {}} selectedFilename={null} />)

    expect(
      (await screen.findAllByTestId('unity-dialogue-item-author')).map((el) =>
        el.textContent
      )
    ).toEqual(['marc', 'luna'])
    expect(screen.getAllByTestId('unity-dialogue-item')).toHaveLength(2)

    await user.selectOptions(
      screen.getByTestId('unity-dialogue-filter-author'),
      'u-marc'
    )
    await user.selectOptions(
      screen.getByTestId('unity-dialogue-filter-period'),
      'year'
    )

    await waitFor(() => {
      expect(screen.getAllByTestId('unity-dialogue-item')).toHaveLength(1)
    })
    expect(screen.getByTestId('unity-dialogue-item-title')).toHaveTextContent('De Marc')
    expect(screen.getByTestId('unity-dialogue-filter-badge-author')).toBeInTheDocument()
    expect(screen.getByTestId('unity-dialogue-filter-badge-period')).toBeInTheDocument()

    // X sur le badge auteur seul : la période reste active.
    await user.click(screen.getByTestId('unity-dialogue-filter-badge-author'))
    await waitFor(() => {
      expect(screen.queryByTestId('unity-dialogue-filter-badge-author')).toBeNull()
    })
    expect(screen.getByTestId('unity-dialogue-filter-badge-period')).toBeInTheDocument()
    expect(screen.getAllByTestId('unity-dialogue-item')).toHaveLength(2)

    await user.click(screen.getByTestId('unity-dialogue-filters-reset'))

    await waitFor(() => {
      expect(screen.queryByTestId('unity-dialogue-active-filters')).toBeNull()
    })
    expect(screen.getAllByTestId('unity-dialogue-item')).toHaveLength(2)
  })

  it('ne rend pas le bloc personnages quand le dialogue n’en a pas', async () => {
    // La fixture par défaut (beforeEach) n'a pas de `speakers`.
    render(<UnityDialogueList onSelectDialogue={() => {}} selectedFilename={null} />)

    await screen.findByTestId('unity-dialogue-item')
    expect(screen.queryByTestId('unity-dialogue-item-speakers')).toBeNull()
  })

  it('pagine la liste à 50/page avec indicateur et navigation', async () => {
    const user = userEvent.setup()
    const many = Array.from({ length: 60 }, (_, index) => ({
      filename: `dialogue_${String(index).padStart(3, '0')}.json`,
      file_path: `/data/dialogue_${index}.json`,
      // Ordre décroissant pour un tri date-desc déterministe.
      modified_time: new Date(2026, 0, 1, 0, 0, 60 - index).toISOString(),
      size_bytes: 1024,
      node_count: index,
      share_count: 0,
    }))
    mockList.mockResolvedValueOnce({ dialogues: many, total: 60 })

    render(<UnityDialogueList onSelectDialogue={() => {}} selectedFilename={null} />)

    await waitFor(() => {
      expect(screen.getByTestId('unity-dialogue-pagination')).toBeInTheDocument()
    })
    expect(screen.getByTestId('unity-dialogue-pagination-indicator')).toHaveTextContent(
      'Page 1 sur 2 — Total : 60',
    )
    // Première page : 50 items.
    expect(screen.getAllByTestId('unity-dialogue-item')).toHaveLength(50)

    const prev = screen.getByTestId('unity-dialogue-pagination-prev')
    expect(prev).toBeDisabled()

    await user.click(screen.getByTestId('unity-dialogue-pagination-next'))

    await waitFor(() => {
      expect(screen.getByTestId('unity-dialogue-pagination-indicator')).toHaveTextContent(
        'Page 2 sur 2 — Total : 60',
      )
    })
    // Deuxième page : les 10 restants.
    expect(screen.getAllByTestId('unity-dialogue-item')).toHaveLength(10)
    expect(screen.getByTestId('unity-dialogue-pagination-next')).toBeDisabled()
  })

  it('crée un dialogue vide sans appel LLM et le sélectionne', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    vi.spyOn(window, 'prompt').mockReturnValue('Nouvelle scène')
    render(<UnityDialogueList onSelectDialogue={onSelect} selectedFilename={null} />)

    await user.click(await screen.findByTestId('create-dialogue-button'))

    await waitFor(() => {
      expect(documentsAPI.putDocument).toHaveBeenCalledWith('nouvelle_scene', {
        document: {
          schemaVersion: '1.2.0',
          title: 'Nouvelle scène',
          nodes: [],
        },
        revision: 1,
        validationMode: 'draft',
        createOnly: true,
      })
    })
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'nouvelle_scene.json' })
    )
  })
})
