/**
 * Tests ExportLogsPanel (Story 5.6 / FR54).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ExportLogsPanel } from './ExportLogsPanel'
import type { ExportLogsResponse } from '../../api/exports'

vi.mock('../../api/exports', () => ({
  getExportLogs: vi.fn(),
}))

vi.mock('../../api/dialogues', () => ({
  previewUnityDialogueExport: vi.fn(),
  downloadUnityDialogue: vi.fn(),
}))

vi.mock('../../utils/logPanelUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/logPanelUtils')>()
  return {
    ...actual,
    downloadLogBlob: vi.fn(actual.downloadLogBlob),
  }
})

import { getExportLogs } from '../../api/exports'
import { previewUnityDialogueExport, downloadUnityDialogue } from '../../api/dialogues'
import { downloadLogBlob } from '../../utils/logPanelUtils'

const mockGetExportLogs = getExportLogs as ReturnType<typeof vi.fn>
const mockPreview = previewUnityDialogueExport as ReturnType<typeof vi.fn>
const mockDownload = downloadUnityDialogue as ReturnType<typeof vi.fn>
const mockDownloadLogBlob = downloadLogBlob as ReturnType<typeof vi.fn>

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderPanel() {
  const qc = makeQueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <ExportLogsPanel />
    </QueryClientProvider>,
  )
}

const emptyResponse: ExportLogsResponse = {
  entries: [],
  total_count: 0,
  success_count: 0,
  failure_count: 0,
}

const sampleResponse: ExportLogsResponse = {
  entries: [
    {
      id: 'log-1',
      timestamp: '2026-06-20T12:00:00.000Z',
      dialogue_id: 'doc_ok',
      filename: 'doc_ok.json',
      export_status: 'success',
      validation_status: 'valid',
      cost_eur: 0.01,
      file_size_bytes: 2048,
      errors: [],
      warnings_gdd: [],
      source: 'batch',
    },
    {
      id: 'log-2',
      timestamp: '2026-06-19T10:00:00.000Z',
      dialogue_id: 'doc_ko',
      filename: 'doc_ko.json',
      export_status: 'failure',
      validation_status: 'invalid',
      cost_eur: null,
      file_size_bytes: null,
      errors: ['choiceId manquant'],
      warnings_gdd: [],
      source: 'graph',
    },
  ],
  total_count: 2,
  success_count: 1,
  failure_count: 1,
}

describe('ExportLogsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('appelle l’API logs au montage', async () => {
    mockGetExportLogs.mockResolvedValue(emptyResponse)
    renderPanel()
    await waitFor(() => {
      expect(mockGetExportLogs).toHaveBeenCalled()
    })
  })

  it('affiche message explicite quand liste vide', async () => {
    mockGetExportLogs.mockResolvedValue(emptyResponse)
    renderPanel()
    expect(await screen.findByText(/Aucun log d'export/)).toBeInTheDocument()
  })

  it('affiche liste avec badge succès/échec et taille formatée', async () => {
    mockGetExportLogs.mockResolvedValue(sampleResponse)
    renderPanel()
    expect(await screen.findByText('doc_ok')).toBeInTheDocument()
    expect(screen.getByTestId('export-status-success')).toHaveTextContent('Succès')
    expect(screen.getByTestId('export-status-failure')).toHaveTextContent('Échec')
    expect(screen.getByText(/Ko/)).toBeInTheDocument()
  })

  it('affiche résumé agrégé X exports, Y succès, Z échecs', async () => {
    mockGetExportLogs.mockResolvedValue(sampleResponse)
    renderPanel()
    const summary = await screen.findByTestId('export-logs-summary')
    expect(summary).toHaveTextContent('2 exports')
    expect(summary).toHaveTextContent('1 succès')
    expect(summary).toHaveTextContent('1 échec')
  })

  it('affiche erreur API', async () => {
    mockGetExportLogs.mockRejectedValue(new Error('Network fail'))
    renderPanel()
    expect(await screen.findByText(/Erreur/)).toBeInTheDocument()
  })

  it('affiche résumé échec validation au clic sur entrée failure', async () => {
    mockGetExportLogs.mockResolvedValue(sampleResponse)
    renderPanel()
    fireEvent.click(await screen.findByText('doc_ko'))
    const detail = await screen.findByTestId('export-log-detail')
    expect(detail).toHaveTextContent('choiceId manquant')
    expect(screen.queryByRole('button', { name: 'Voir JSON' })).not.toBeInTheDocument()
  })

  it('ouvre preview depuis log succès via Voir JSON', async () => {
    mockGetExportLogs.mockResolvedValue({
      ...sampleResponse,
      entries: [sampleResponse.entries[0]],
      total_count: 1,
      success_count: 1,
      failure_count: 0,
    })
    mockPreview.mockResolvedValue({
      json_content: '{"nodes":[]}',
      size_bytes: 12,
      node_count: 0,
      filename: 'doc_ok.json',
      schema_valid: true,
      errors: [],
    })
    renderPanel()
    fireEvent.click(await screen.findByText('doc_ok'))
    fireEvent.click(screen.getByRole('button', { name: 'Voir JSON' }))
    await waitFor(() => {
      expect(mockPreview).toHaveBeenCalledWith('doc_ok')
    })
  })

  it('repli download quand preview échoue mais fichier persisté existe', async () => {
    mockGetExportLogs.mockResolvedValue({
      ...sampleResponse,
      entries: [sampleResponse.entries[0]],
      total_count: 1,
      success_count: 1,
      failure_count: 0,
    })
    mockPreview.mockRejectedValue(new Error('Preview indisponible'))
    mockDownload.mockResolvedValue(
      new Blob(['{"nodes":[{"id":"n1"}]}'], { type: 'application/json' }),
    )
    renderPanel()
    fireEvent.click(await screen.findByText('doc_ok'))
    fireEvent.click(screen.getByRole('button', { name: 'Voir JSON' }))
    await waitFor(() => {
      expect(mockDownload).toHaveBeenCalledWith('doc_ok')
    })
  })

  it('refetch avec filtre statut échec côté serveur', async () => {
    mockGetExportLogs.mockResolvedValue({
      entries: [sampleResponse.entries[1]],
      total_count: 1,
      success_count: 0,
      failure_count: 1,
    })
    renderPanel()
    await screen.findByText('doc_ko')
    fireEvent.change(screen.getByDisplayValue('Cette semaine').closest('label')?.querySelector('select') ?? screen.getAllByRole('combobox')[0], {
      target: { value: 'week' },
    })
    const statusSelect = screen.getAllByRole('combobox')[1]
    fireEvent.change(statusSelect, { target: { value: 'failure' } })
    await waitFor(() => {
      expect(mockGetExportLogs).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'failure' }),
      )
    })
  })
})

describe('ExportLogsPanel export blob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    URL.createObjectURL = vi.fn(() => 'blob:mock')
    URL.revokeObjectURL = vi.fn()
  })

  it('télécharge JSON des entrées filtrées', async () => {
    mockGetExportLogs.mockResolvedValue(sampleResponse)
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    renderPanel()
    await screen.findByText('doc_ok')
    fireEvent.click(screen.getByRole('button', { name: /Exporter logs \(JSON\)/ }))
    expect(clickSpy).toHaveBeenCalled()
    clickSpy.mockRestore()
  })

  it('télécharge CSV des entrées filtrées avec en-têtes RFC4180', async () => {
    mockGetExportLogs.mockResolvedValue(sampleResponse)
    renderPanel()
    await screen.findByText('doc_ok')
    fireEvent.click(screen.getByRole('button', { name: /Exporter logs \(CSV\)/ }))
    expect(mockDownloadLogBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      'export-logs',
      'csv',
    )
    const blob = mockDownloadLogBlob.mock.calls[0]?.[0] as Blob
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsText(blob)
    })
    expect(text).toContain('timestamp,dialogue_id,filename')
    expect(text).toContain('doc_ok')
  })
})
