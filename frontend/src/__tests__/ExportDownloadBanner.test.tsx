/**
 * Story 5.4 — bannière téléchargement post-export single.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExportDownloadBanner } from '../components/unityDialogues/ExportDownloadBanner'

describe('ExportDownloadBanner', () => {
  it('affiche le filename et déclenche onDownload au clic Télécharger', async () => {
    const onDownload = vi.fn()
    const user = userEvent.setup()

    render(
      <ExportDownloadBanner
        exportDownload={{ jsonContent: '{"nodes":[]}', filename: 'quest_arc' }}
        isDownloading={false}
        onDownload={onDownload}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.getByTestId('export-download-filename')).toHaveTextContent('quest_arc.json')
    await user.click(screen.getByTestId('export-download-button'))
    expect(onDownload).toHaveBeenCalledOnce()
  })

  it('affiche indicateur progression quand isDownloading', () => {
    render(
      <ExportDownloadBanner
        exportDownload={{ jsonContent: '{}', filename: 'big.json' }}
        isDownloading
        onDownload={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.getByTestId('export-download-progress')).toHaveTextContent(
      'Téléchargement en cours…',
    )
  })
})
