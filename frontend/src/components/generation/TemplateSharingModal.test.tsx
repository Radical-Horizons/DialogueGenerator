/**
 * Tests TemplateSharingModal — invite / revoke destinataires.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TemplateSharingModal } from './TemplateSharingModal'
import * as templatesAPI from '../../api/templates'

vi.mock('../../api/templates', () => ({
  listTemplateSharesApi: vi.fn(),
  createTemplateShareApi: vi.fn(),
  deleteTemplateShareApi: vi.fn(),
}))

describe('TemplateSharingModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(templatesAPI.listTemplateSharesApi).mockResolvedValue([])
  })

  it('charge la liste et invite un writer', async () => {
    const created = {
      template_id: 'tpl-1',
      user_id: 'writer-b',
      username: 'writer-b',
      created_at: '2026-08-16T00:00:00Z',
    }
    vi.mocked(templatesAPI.createTemplateShareApi).mockResolvedValue(created)
    vi.mocked(templatesAPI.listTemplateSharesApi)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([created])

    render(
      <TemplateSharingModal
        templateId="tpl-1"
        templateName="Alpha"
        open
        onClose={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(templatesAPI.listTemplateSharesApi).toHaveBeenCalledWith('tpl-1')
    })

    fireEvent.change(screen.getByTestId('template-share-username'), {
      target: { value: 'writer-b' },
    })
    fireEvent.click(screen.getByTestId('template-share-invite'))

    await waitFor(() => {
      expect(templatesAPI.createTemplateShareApi).toHaveBeenCalledWith(
        'tpl-1',
        'writer-b',
      )
    })
    expect(await screen.findByTestId('template-share-row-writer-b')).toBeInTheDocument()
  })

  it('révoque un destinataire listé', async () => {
    vi.mocked(templatesAPI.listTemplateSharesApi).mockResolvedValue([
      {
        template_id: 'tpl-1',
        user_id: 'writer-b',
        username: 'writer-b',
        created_at: '2026-08-16T00:00:00Z',
      },
    ])
    vi.mocked(templatesAPI.deleteTemplateShareApi).mockResolvedValue()

    render(
      <TemplateSharingModal
        templateId="tpl-1"
        templateName="Alpha"
        open
        onClose={vi.fn()}
      />,
    )

    expect(await screen.findByTestId('template-share-row-writer-b')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('template-share-revoke-writer-b'))

    await waitFor(() => {
      expect(templatesAPI.deleteTemplateShareApi).toHaveBeenCalledWith(
        'tpl-1',
        'writer-b',
      )
    })
    await waitFor(() => {
      expect(screen.queryByTestId('template-share-row-writer-b')).not.toBeInTheDocument()
    })
  })
})
