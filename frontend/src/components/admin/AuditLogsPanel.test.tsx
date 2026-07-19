import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { AuditLogsPanel } from './AuditLogsPanel'
import * as auditLogsApi from '../../api/auditLogs'

vi.mock('../../api/auditLogs')

const sampleEntry = {
  id: 'audit-1',
  created_at: '2026-07-19T18:00:00+00:00',
  actor_user_id: 'admin-a',
  actor_username: 'admin-a',
  action: 'user.created',
  target_type: 'user',
  target_id: 'writer-x',
  metadata: { new_role: 'writer' },
}

describe('AuditLogsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auditLogsApi.listAuditLogs).mockResolvedValue({
      items: [sampleEntry],
      total: 1,
      page: 1,
      page_size: 50,
    })
    vi.mocked(auditLogsApi.exportAuditLogs).mockResolvedValue(
      new Blob(['[]'], { type: 'application/json' }),
    )
  })

  it('charge et affiche les entrées d’audit', async () => {
    render(<AuditLogsPanel />)

    expect(await screen.findByRole('heading', { name: /journaux d’audit/i })).toBeInTheDocument()
    expect(await screen.findByText('user/writer-x')).toBeInTheDocument()
    expect(screen.getAllByText('user.created').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('admin-a')).toBeInTheDocument()
  })

  it('applique les filtres puis relance la liste', async () => {
    const user = userEvent.setup()
    render(<AuditLogsPanel />)
    await screen.findByText('user.created')

    await user.type(screen.getByLabelText(/filtrer par utilisateur/i), 'admin-a')
    await user.selectOptions(screen.getByLabelText(/filtrer par action/i), 'user.created')
    await user.click(screen.getByRole('button', { name: /filtrer/i }))

    await waitFor(() => {
      expect(auditLogsApi.listAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'admin-a',
          action: 'user.created',
          page: 1,
        }),
      )
    })
  })

  it('exporte JSON via le client API', async () => {
    const user = userEvent.setup()
    const createObjectURL = vi.fn(() => 'blob:audit')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    })

    render(<AuditLogsPanel />)
    await screen.findByText('user.created')
    await user.click(screen.getByRole('button', { name: /exporter JSON/i }))

    await waitFor(() => {
      expect(auditLogsApi.exportAuditLogs).toHaveBeenCalledWith('json', expect.any(Object))
    })
  })

  it('affiche un message vide sans entrées', async () => {
    vi.mocked(auditLogsApi.listAuditLogs).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 50,
    })
    render(<AuditLogsPanel />)
    expect(await screen.findByText(/aucune entrée d’audit/i)).toBeInTheDocument()
  })
})
