import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { AdminPanel } from './AdminPanel'
import { resolveAdminTabId } from './adminTabs'

vi.mock('./UserManagementPanel', () => ({
  UserManagementPanel: () => <div>Panel utilisateurs</div>,
}))
vi.mock('./LlmModelsPanel', () => ({
  LlmModelsPanel: () => <div>Panel modèles</div>,
}))
vi.mock('./AuditLogsPanel', () => ({
  AuditLogsPanel: () => <div>Panel audit</div>,
}))
vi.mock('./BenchmarkPanel', () => ({
  BenchmarkPanel: () => <div>Panel benchmark</div>,
}))

describe('resolveAdminTabId', () => {
  it('accepte les onglets connus et bascule sinon sur users', () => {
    expect(resolveAdminTabId('llm-models')).toBe('llm-models')
    expect(resolveAdminTabId('audit-logs')).toBe('audit-logs')
    expect(resolveAdminTabId('benchmark')).toBe('benchmark')
    expect(resolveAdminTabId('unknown')).toBe('users')
    expect(resolveAdminTabId(null)).toBe('users')
  })
})

describe('AdminPanel', () => {
  it('affiche quatre onglets et bascule le contenu', async () => {
    const interaction = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AdminPanel />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Administration' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Utilisateurs' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Modèles LLM' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Journaux d’audit' })).toBeInTheDocument()
    expect(screen.getByText('Panel utilisateurs')).toBeInTheDocument()

    await interaction.click(screen.getByRole('button', { name: 'Modèles LLM' }))
    expect(screen.getByText('Panel modèles')).toBeInTheDocument()

    await interaction.click(screen.getByRole('button', { name: 'Journaux d’audit' }))
    expect(screen.getByText('Panel audit')).toBeInTheDocument()

    await interaction.click(screen.getByRole('button', { name: 'Benchmark' }))
    expect(screen.getByText('Panel benchmark')).toBeInTheDocument()
  })
})
