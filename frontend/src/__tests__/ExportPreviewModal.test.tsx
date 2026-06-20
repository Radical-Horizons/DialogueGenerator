/**
 * Story 5.5 — preview export modal single/batch (FR53).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ExportPreviewModal } from '../components/unityDialogues/ExportPreviewModal'

describe('ExportPreviewModal (Story 5.5)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'navigator',
      Object.assign(navigator, {
        clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
      }),
    )
  })

  it('affiche métadonnées single avec node_count et taille formatée', () => {
    render(
      <ExportPreviewModal
        isOpen
        mode="single"
        singlePreview={{
          json_content: '{"schemaVersion":"1.1.0","nodes":[{"id":"START","line":"Hi","choices":[]}]}',
          size_bytes: 45 * 1024,
          node_count: 3,
          filename: 'demo.json',
          schema_valid: true,
          errors: [],
        }}
        onClose={() => undefined}
      />,
    )

    expect(screen.getByTestId('export-preview-modal')).toBeTruthy()
    expect(screen.getByTestId('export-preview-node-count').textContent).toBe('3')
    expect(screen.getByTestId('export-preview-size').textContent).toMatch(/Ko|Mo|o/)
    expect(screen.getByTestId('export-preview-json-tree')).toBeTruthy()
  })

  it('affiche warning fichier volumineux au-delà de 10 Mo', () => {
    render(
      <ExportPreviewModal
        isOpen
        mode="single"
        singlePreview={{
          json_content: '{"schemaVersion":"1.1.0","nodes":[]}',
          size_bytes: 11 * 1024 * 1024,
          node_count: 1,
          filename: 'big.json',
          schema_valid: true,
          errors: [],
        }}
        onClose={() => undefined}
      />,
    )

    expect(screen.getByTestId('export-preview-large-warning')).toBeTruthy()
    expect(screen.getByTestId('export-preview-large-warning').textContent).toContain('volumineux')
  })

  it('copie le JSON single dans le presse-papier', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal(
      'navigator',
      Object.assign(navigator, {
        clipboard: { writeText },
      }),
    )

    render(
      <ExportPreviewModal
        isOpen
        mode="single"
        singlePreview={{
          json_content: '{"schemaVersion":"1.1.0","nodes":[]}',
          size_bytes: 100,
          node_count: 1,
          filename: 'demo.json',
          schema_valid: true,
          errors: [],
        }}
        onClose={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('export-preview-copy'))
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('{"schemaVersion":"1.1.0","nodes":[]}')
    })
  })

  it('export depuis modal appelle onExport', () => {
    const onExport = vi.fn()
    render(
      <ExportPreviewModal
        isOpen
        mode="single"
        singlePreview={{
          json_content: '{"schemaVersion":"1.1.0","nodes":[]}',
          size_bytes: 100,
          node_count: 1,
          filename: 'demo.json',
          schema_valid: true,
          errors: [],
        }}
        onClose={() => undefined}
        onExport={onExport}
      />,
    )

    fireEvent.click(screen.getByTestId('export-preview-export-button'))
    expect(onExport).toHaveBeenCalledTimes(1)
  })

  it('résumé batch affiche le nombre de dialogues', () => {
    render(
      <ExportPreviewModal
        isOpen
        mode="batch"
        batchPreview={{
          dialogue_count: 2,
          total_size_bytes: 2048,
          items: [
            {
              document_id: 'a',
              filename: 'a.json',
              size_bytes: 1024,
              node_count: 1,
              json_preview: '{"nodes":[]}',
              json_preview_truncated: false,
            },
            {
              document_id: 'b',
              filename: 'b.json',
              size_bytes: 1024,
              node_count: 2,
              json_preview: '{"nodes":[]}',
              json_preview_truncated: false,
            },
          ],
        }}
        onClose={() => undefined}
      />,
    )

    expect(screen.getByTestId('export-preview-batch-count').textContent).toBe('2')
    expect(screen.getByTestId('export-preview-batch-item-a')).toBeTruthy()
    expect(screen.getByTestId('export-preview-batch-item-b')).toBeTruthy()
  })
})
