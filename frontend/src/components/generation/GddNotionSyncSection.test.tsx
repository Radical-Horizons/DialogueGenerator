/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { GddNotionSyncSection } from './GddNotionSyncSection'

const mockGetStatus = vi.fn()
const mockGetConfig = vi.fn()
const mockGetProgress = vi.fn()
const mockGetArchives = vi.fn()
const mockPostSync = vi.fn()
const mockPostTest = vi.fn()
const mockPostRestore = vi.fn()

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
}

vi.mock('../../api/gddNotionSync', () => ({
  getGddNotionSyncStatus: (...a: unknown[]) => mockGetStatus(...a),
  getGddNotionSyncConfig: (...a: unknown[]) => mockGetConfig(...a),
  getGddNotionSyncProgress: (...a: unknown[]) => mockGetProgress(...a),
  getGddNotionArchives: (...a: unknown[]) => mockGetArchives(...a),
  putGddNotionSyncConfig: vi.fn(),
  postGddNotionSync: (...a: unknown[]) => mockPostSync(...a),
  postGddNotionTestConnection: (...a: unknown[]) => mockPostTest(...a),
  postGddNotionArchiveRestore: (...a: unknown[]) => mockPostRestore(...a),
}))

describe('GddNotionSyncSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
      expect(screen.getByText(/1 entité/i)).toBeInTheDocument()
    })
    expect(mockPostSync).toHaveBeenCalled()
  })

  it('affiche le résumé de configuration chargée depuis l’API', async () => {
    render(<GddNotionSyncSection />)
    expect(await screen.findByText(/Résumé configuration/i)).toBeInTheDocument()
    expect(screen.getByText(/Sources :/i)).toBeInTheDocument()
    expect(mockGetConfig).toHaveBeenCalled()
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
      expect(mockPostSync).toHaveBeenCalledWith(true)
    })
  })

  it('affiche l’historique et lance une restauration confirmée', async () => {
    const user = userEvent.setup()
    mockGetArchives.mockResolvedValue({
      archives: [
        {
          id: '20260101T120000Z_a1b2c3d4',
          created_at: '2026-01-01T12:00:00Z',
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
  })
})
