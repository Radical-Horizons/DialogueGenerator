/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useContextStore } from '../../store/contextStore'
import { GddNotionSyncSection } from './GddNotionSyncSection'

const mockGetStatus = vi.fn()
const mockGetConfig = vi.fn()
const mockGetProgress = vi.fn()
const mockGetArchives = vi.fn()
const mockPostSync = vi.fn()
const mockPostTest = vi.fn()
const mockPostRestore = vi.fn()
const mockGetCheckpoint = vi.fn()
const mockDeleteCheckpoint = vi.fn()
const mockPostPause = vi.fn()
const mockPostUnpause = vi.fn()
const mockPostCancel = vi.fn()

const idleProgressBody = {
  active: false,
  started_at: null,
  force_full: null,
  mirror_rebuild: null,
  phase: 'idle',
  sources_total: 0,
  sources_completed: 0,
  current_source_index: 0,
  current_category_file: '',
  pages_total_known: 0,
  pages_processed: 0,
  pages_in_current_source: 0,
  current_page_in_source: 0,
  current_page_id_short: '',
  message: '',
  paused: false,
}

const mockPutConfig = vi.fn()
const mockPostPreview = vi.fn()

vi.mock('../../api/gddNotionSync', () => ({
  getGddNotebooklmExportZip: vi.fn().mockResolvedValue(new Blob(['zip'], { type: 'application/zip' })),
  getGddNotionSyncStatus: (...a: unknown[]) => mockGetStatus(...a),
  getGddNotionSyncConfig: (...a: unknown[]) => mockGetConfig(...a),
  getGddNotionSyncProgress: (...a: unknown[]) => mockGetProgress(...a),
  getGddNotionArchives: (...a: unknown[]) => mockGetArchives(...a),
  getGddFullSyncCheckpoint: (...a: unknown[]) => mockGetCheckpoint(...a),
  deleteGddFullSyncCheckpoint: (...a: unknown[]) => mockDeleteCheckpoint(...a),
  postGddFullSyncPause: (...a: unknown[]) => mockPostPause(...a),
  postGddFullSyncUnpause: (...a: unknown[]) => mockPostUnpause(...a),
  postGddFullSyncCancel: (...a: unknown[]) => mockPostCancel(...a),
  putGddNotionSyncConfig: (...a: unknown[]) => mockPutConfig(...a),
  postGddNotionSync: (...a: unknown[]) => mockPostSync(...a),
  postGddNotionTestConnection: (...a: unknown[]) => mockPostTest(...a),
  postGddNotionPreviewDatabaseRow: (...a: unknown[]) => mockPostPreview(...a),
  postGddNotionArchiveRestore: (...a: unknown[]) => mockPostRestore(...a),
}))

describe('GddNotionSyncSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPutConfig.mockImplementation(async (body: {
      included_categories?: string[]
      sync_interval_minutes?: number
      auto_sync_enabled?: boolean
      archive_retention_count?: number
    }) => {
      const { config: prev } = await mockGetConfig()
      return {
        config: {
          ...prev,
          ...(body.included_categories !== undefined
            ? { included_categories: body.included_categories }
            : {}),
          ...(body.sync_interval_minutes !== undefined
            ? { sync_interval_minutes: body.sync_interval_minutes }
            : {}),
          ...(body.auto_sync_enabled !== undefined
            ? { auto_sync_enabled: body.auto_sync_enabled }
            : {}),
          ...(body.archive_retention_count !== undefined
            ? { archive_retention_count: body.archive_retention_count }
            : {}),
        },
      }
    })
    useContextStore.setState({ gddDataRevision: 0 })
    mockGetStatus.mockResolvedValue({
      last_started_at: null,
      last_finished_at: null,
      last_success: null,
      message: '',
      updated_entities: 0,
      partial_errors: [],
    })
    mockGetConfig.mockResolvedValue({
      config: {
        schema_version: 1,
        sync_interval_minutes: 60,
        auto_sync_enabled: false,
        sources: [{ notion_id: '1886e4d2-1b45-8039-b51b-eb3826fce1b5', kind: 'page', category_file: 'Test.json' }],
        included_categories: [],
        mirror_rebuild_on_full_sync: false,
        archive_retention_count: 10,
        token_configured: true,
      },
    })
    mockGetProgress.mockResolvedValue(idleProgressBody)
    mockGetArchives.mockResolvedValue({ archives: [] })
    mockGetCheckpoint.mockResolvedValue({
      resumable: false,
      checkpoint_status: 'none',
      checkpoint_file_present: false,
      orphan_staging_runs: 0,
      message: '',
      staging_run_name: '',
      archive_rel: '',
      sources_total: 0,
      sources_completed: 0,
      completed_category_files: [],
      eligible_category_files: [],
    })
    mockDeleteCheckpoint.mockResolvedValue({ ok: true, message: '' })
    mockPostPause.mockResolvedValue({ ok: false, message: '' })
    mockPostUnpause.mockResolvedValue({ ok: false, message: '' })
    mockPostCancel.mockResolvedValue({ ok: false, message: '' })
    mockPostPreview.mockResolvedValue({
      ok: true,
      message: 'OK',
      category_file: 'Alpha.json',
      notion_database_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      data_sources_count: 1,
      data_source_entries: [{ id: 'ds1', name: 'Main' }],
      query_total_rows: 1,
      first_page_id: 'page-1',
      property_keys_from_query_row: ['Name'],
      property_keys_from_get_page: ['Name'],
      mapped_record: { Nom: 'Test', values: { Col: 'v' }, sections: { _general: 'x' } },
      compact_table: false,
    })
  })

  it('affiche chargement puis succès sur Synchroniser maintenant', async () => {
    const user = userEvent.setup()
    mockPostSync.mockResolvedValue({
      success: true,
      message: '1 entité(s) mise(s) à jour',
      updated_entities: 1,
      partial_errors: [],
    })
    render(<GddNotionSyncSection />)
    await screen.findByRole('button', { name: /Synchroniser \(incrémental\)/i })
    await user.click(screen.getByRole('button', { name: /Synchroniser \(incrémental\)/i }))
    await waitFor(() => {
      expect(screen.getByText(/Synchronisation réussie/i)).toBeInTheDocument()
      expect(screen.getByText(/1 entité/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /Fermer ce message/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Fermer ce message/i }))
    await waitFor(() => {
      expect(screen.queryByText(/Synchronisation réussie/i)).not.toBeInTheDocument()
    })
    expect(mockPutConfig).not.toHaveBeenCalled()
    expect(mockPostSync).toHaveBeenCalledWith(
      false,
      expect.objectContaining({ includedCategories: [] }),
    )
    expect(useContextStore.getState().gddDataRevision).toBe(1)
  })

  it('affiche le résumé de configuration chargée depuis l’API', async () => {
    render(<GddNotionSyncSection />)
    expect(await screen.findByText(/Résumé configuration/i)).toBeInTheDocument()
    expect(screen.getByText(/Sources :/i)).toBeInTheDocument()
    expect(mockGetConfig).toHaveBeenCalled()
  })

  it('affiche des cases à cocher pour chaque source database (filtre périmètre)', async () => {
    mockGetConfig.mockResolvedValue({
      config: {
        schema_version: 1,
        sync_interval_minutes: 60,
        auto_sync_enabled: false,
        sources: [
          { notion_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', kind: 'database', category_file: 'Alpha.json' },
          { notion_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', kind: 'database', category_file: 'Beta.json' },
          { notion_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', kind: 'page', category_file: 'Fiche.json' },
        ],
        included_categories: [],
        mirror_rebuild_on_full_sync: false,
        archive_retention_count: 10,
        token_configured: true,
      },
    })
    render(<GddNotionSyncSection />)
    expect(await screen.findByRole('group', { name: /Bases de données Notion/i })).toBeInTheDocument()
    expect(screen.getByText('Alpha.json')).toBeInTheDocument()
    expect(screen.getByText('Beta.json')).toBeInTheDocument()
    expect(screen.queryByText('Fiche.json')).not.toBeInTheDocument()
  })

  it('Cocher essentiels décoche les bases listées comme secondaires', async () => {
    const user = userEvent.setup()
    mockGetConfig.mockResolvedValue({
      config: {
        schema_version: 1,
        sync_interval_minutes: 60,
        auto_sync_enabled: false,
        sources: [
          { notion_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', kind: 'database', category_file: 'Alpha.json' },
          { notion_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', kind: 'database', category_file: 'Notebook.json' },
        ],
        included_categories: [],
        mirror_rebuild_on_full_sync: false,
        archive_retention_count: 10,
        token_configured: true,
      },
    })
    render(<GddNotionSyncSection />)
    const group = await screen.findByRole('group', { name: /Bases de données Notion/i })
    await user.click(screen.getByRole('button', { name: /Cocher essentiels/i }))
    const boxes = within(group).getAllByRole('checkbox') as HTMLInputElement[]
    const byFile = (name: string) => boxes.find((cb) => cb.closest('label')?.textContent?.includes(name))
    expect(byFile('Alpha.json')?.checked).toBe(true)
    expect(byFile('Notebook.json')?.checked).toBe(false)
    await waitFor(() => {
      expect(mockPutConfig).toHaveBeenCalledWith({ included_categories: ['Alpha.json'] })
    })
  })

  it('Cocher essentiels décoche Caractéristiques FP (secondaire)', async () => {
    const user = userEvent.setup()
    const fp = 'Caractéristiques_—_Uresaïr_(FP).json'
    mockGetConfig.mockResolvedValue({
      config: {
        schema_version: 1,
        sync_interval_minutes: 60,
        auto_sync_enabled: false,
        sources: [
          { notion_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', kind: 'database', category_file: 'Alpha.json' },
          { notion_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', kind: 'database', category_file: fp },
        ],
        included_categories: [],
        mirror_rebuild_on_full_sync: false,
        archive_retention_count: 10,
        token_configured: true,
      },
    })
    render(<GddNotionSyncSection />)
    const group = await screen.findByRole('group', { name: /Bases de données Notion/i })
    await user.click(screen.getByRole('button', { name: /Cocher essentiels/i }))
    const boxes = within(group).getAllByRole('checkbox') as HTMLInputElement[]
    const byFile = (name: string) => boxes.find((cb) => cb.closest('label')?.textContent?.includes(name))
    expect(byFile('Alpha.json')?.checked).toBe(true)
    expect(byFile(fp)?.checked).toBe(false)
    await waitFor(() => {
      expect(mockPutConfig).toHaveBeenCalled()
    })
  })

  it('Tout décocher puis enregistrer envoie included_categories vide (toutes les bases)', async () => {
    const user = userEvent.setup()
    mockGetConfig.mockResolvedValue({
      config: {
        schema_version: 1,
        sync_interval_minutes: 60,
        auto_sync_enabled: false,
        sources: [
          { notion_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', kind: 'database', category_file: 'Alpha.json' },
          { notion_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', kind: 'database', category_file: 'Beta.json' },
        ],
        included_categories: [],
        mirror_rebuild_on_full_sync: false,
        archive_retention_count: 10,
        token_configured: true,
      },
    })
    render(<GddNotionSyncSection />)
    const group = await screen.findByRole('group', { name: /Bases de données Notion/i })
    await user.click(screen.getByRole('button', { name: /Tout décocher/i }))
    await waitFor(() => {
      const checkboxes = within(group).getAllByRole('checkbox') as HTMLInputElement[]
      expect(checkboxes.every((cb) => !cb.checked)).toBe(true)
    })
    await user.click(screen.getByRole('button', { name: /Sauver sans sync/i }))
    await waitFor(() => {
      expect(mockPutConfig).toHaveBeenCalled()
    })
    const body = mockPutConfig.mock.calls[0]?.[0] as { included_categories?: string[] }
    expect(body.included_categories).toEqual([])
  })

  it('appelle postGddNotionSync(true) pour Sync complète', async () => {
    const user = userEvent.setup()
    mockPostSync.mockResolvedValue({
      success: true,
      message: 'ok',
      updated_entities: 1,
      partial_errors: [],
    })
    render(<GddNotionSyncSection />)
    await screen.findByRole('button', { name: /Sync complète/i })
    await user.click(screen.getByRole('button', { name: /Sync complète/i }))
    await waitFor(() => {
      expect(mockPostSync.mock.calls[0]?.[0]).toBe(true)
    })
    expect(mockPutConfig).not.toHaveBeenCalled()
    expect(mockPostSync).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ includedCategories: [] }),
    )
  })

  it('Tester 1 ligne appelle preview-database-row et affiche le JSON', async () => {
    const user = userEvent.setup()
    mockGetConfig.mockResolvedValue({
      config: {
        schema_version: 1,
        sync_interval_minutes: 60,
        auto_sync_enabled: false,
        sources: [
          { notion_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', kind: 'database', category_file: 'Alpha.json' },
        ],
        included_categories: [],
        mirror_rebuild_on_full_sync: false,
        archive_retention_count: 10,
        token_configured: true,
      },
    })
    render(<GddNotionSyncSection />)
    const row = await screen.findByRole('button', { name: /Tester 1 ligne/i })
    await user.click(row)
    await waitFor(() => {
      expect(mockPostPreview).toHaveBeenCalledWith('Alpha.json')
    })
    expect(await screen.findByRole('dialog', { name: /Test Notion/i })).toBeInTheDocument()
    expect(screen.getByText(/Data sources/i)).toBeInTheDocument()
    expect(screen.getByText(/"Nom"/)).toBeInTheDocument()
    expect(screen.getByText(/"values"/)).toBeInTheDocument()
  })

  it('affiche le bandeau reprise et appelle postGddNotionSync avec resume', async () => {
    const user = userEvent.setup()
    mockGetCheckpoint.mockResolvedValue({
      resumable: true,
      checkpoint_status: 'resumable',
      checkpoint_file_present: true,
      orphan_staging_runs: 1,
      message: 'Reprise possible.',
      staging_run_name: 'run1',
      archive_rel: '.archive/x',
      sources_total: 2,
      sources_completed: 1,
      completed_category_files: ['A.json'],
      eligible_category_files: ['A.json', 'B.json'],
    })
    mockPostSync.mockResolvedValue({
      success: true,
      message: 'ok',
      updated_entities: 1,
      partial_errors: [],
    })
    render(<GddNotionSyncSection />)
    expect(await screen.findByText(/onglet fermé/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Reprendre la sync/i }))
    await waitFor(() => {
      expect(mockPostSync).toHaveBeenCalledWith(true, {
        resume: true,
        includedCategories: [],
      })
    })
  })

  it('affiche l’historique et lance une restauration confirmée', async () => {
    const user = userEvent.setup()
    mockGetArchives.mockResolvedValue({
      archives: [
        {
          id: '20260101T120000Z_a1b2c3d4',
          created_at: '2026-01-01T12:00:00Z',
          size_bytes: 12_345,
          fiche_count: 42,
        },
      ],
    })
    mockPostRestore.mockResolvedValue({
      ok: true,
      message: 'Restauration OK',
      new_backup_id: null,
    })
    render(<GddNotionSyncSection />)
    expect(await screen.findByText(/Historique des sauvegardes/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Restaurer$/i }))
    expect(screen.getByRole('dialog', { name: /Restaurer cette sauvegarde/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Confirmer la restauration/i }))
    await waitFor(() => {
      expect(mockPostRestore).toHaveBeenCalledWith('20260101T120000Z_a1b2c3d4', {
        backup_current: true,
      })
    })
    expect(useContextStore.getState().gddDataRevision).toBe(1)
  })

  it('sync incrémentale : envoie les bases cochées du périmètre sauvegardé', async () => {
    const user = userEvent.setup()
    mockGetConfig.mockResolvedValue({
      config: {
        schema_version: 1,
        sync_interval_minutes: 60,
        auto_sync_enabled: false,
        sources: [
          { notion_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', kind: 'database', category_file: 'Alpha.json' },
          { notion_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', kind: 'database', category_file: 'Beta.json' },
          { notion_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', kind: 'page', category_file: 'Fiche.json' },
        ],
        included_categories: ['Alpha.json'],
        mirror_rebuild_on_full_sync: false,
        archive_retention_count: 10,
        token_configured: true,
      },
    })
    mockPostSync.mockResolvedValue({
      success: true,
      message: 'ok',
      updated_entities: 1,
      partial_errors: [],
    })
    render(<GddNotionSyncSection />)
    expect((await screen.findAllByText(/1 base\(s\) cochée\(s\)/i)).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: /Synchroniser \(incrémental\)/i }))
    await waitFor(() => {
      expect(mockPostSync).toHaveBeenCalledWith(
        false,
        expect.objectContaining({ includedCategories: ['Alpha.json'] }),
      )
    })
  })

  it('périmètre non chargé : boutons de sync désactivés (pas de run sur toutes les sources)', async () => {
    const configGate: { resolve: (v: unknown) => void } = { resolve: () => {} }
    mockGetConfig.mockImplementation(
      () =>
        new Promise((resolve) => {
          configGate.resolve = resolve
        }),
    )
    render(<GddNotionSyncSection />)
    const incremental = await screen.findByRole('button', { name: /Synchroniser \(incrémental\)/i })
    expect(incremental).toBeDisabled()
    expect(screen.getByRole('button', { name: /Sync complète/i })).toBeDisabled()
    expect(screen.getAllByText(/chargement du périmètre/i).length).toBeGreaterThan(0)
    expect(mockPostSync).not.toHaveBeenCalled()
    configGate.resolve({
      config: {
        schema_version: 1,
        sync_interval_minutes: 60,
        auto_sync_enabled: false,
        sources: [
          { notion_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', kind: 'database', category_file: 'Alpha.json' },
          { notion_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', kind: 'database', category_file: 'Beta.json' },
        ],
        included_categories: ['Beta.json'],
        mirror_rebuild_on_full_sync: false,
        archive_retention_count: 10,
        token_configured: true,
      },
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Synchroniser \(incrémental\)/i })).toBeEnabled()
    })
  })

  it('affiche l’aide périmètre dans un tooltip (dépliable au clic)', async () => {
    const user = userEvent.setup()
    render(<GddNotionSyncSection />)
    const help = await screen.findByRole('button', {
      name: /Aide sur le périmètre des bases/i,
    })
    expect(help).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryAllByText(/pas de filtre \(toutes les bases/i)).toHaveLength(0)
    await user.click(help)
    expect(help).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByText(/pas de filtre \(toutes les bases/i).length).toBeGreaterThan(0)
  })

  it('affiche erreur lisible si la sync échoue', async () => {
    const user = userEvent.setup()
    mockPostSync.mockResolvedValue({
      success: false,
      message: 'Sync Notion échouée — réseau',
      updated_entities: 0,
      partial_errors: [],
    })
    render(<GddNotionSyncSection />)
    await user.click(await screen.findByRole('button', { name: /Synchroniser \(incrémental\)/i }))
    await waitFor(() => {
      expect(screen.getByText(/Sync Notion échouée/)).toBeInTheDocument()
    })
    expect(useContextStore.getState().gddDataRevision).toBe(0)
  })
})
