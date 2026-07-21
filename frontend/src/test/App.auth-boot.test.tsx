import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

const initialize = vi.fn().mockResolvedValue(undefined)

vi.mock('../store/authStore', () => ({
  useAuthStore: Object.assign(
    (selector?: (state: { initialize: typeof initialize }) => unknown) => {
      const state = { initialize }
      return selector ? selector(state) : state
    },
    {
      getState: () => ({ initialize }),
    },
  ),
}))

vi.mock('../utils/logging', () => ({
  initLogging: vi.fn(),
}))

vi.mock('../components/layout/MainLayout', () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('../components/auth/LoginForm', () => ({
  LoginForm: () => <div>login-form</div>,
}))

vi.mock('../components/layout/Dashboard', () => ({
  Dashboard: () => <div>dashboard</div>,
}))

vi.mock('../components/unityDialogues/UnityDialoguesPage', () => ({
  UnityDialoguesPage: () => <div>unity</div>,
}))

vi.mock('../components/usage/UsageDashboard', () => ({
  UsageDashboard: () => <div>usage</div>,
}))

vi.mock('../pages/GraphEditorPage', () => ({
  GraphEditorPage: () => <div>graph</div>,
}))

vi.mock('../components/admin/UserManagementPanel', () => ({
  UserManagementPanel: () => <div>users</div>,
}))

vi.mock('../components/admin/AuditLogsPanel', () => ({
  AuditLogsPanel: () => <div>audit</div>,
}))

vi.mock('../components/shared', () => ({
  ToastContainer: () => null,
}))

vi.mock('../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: () => undefined,
}))

describe('App auth boot', () => {
  beforeEach(() => {
    initialize.mockClear()
  })

  it('appelle initialize au montage (y compris hors ProtectedRoute /login)', async () => {
    const { default: App } = await import('../App')
    render(<App />)
    expect(initialize).toHaveBeenCalled()
  })
})
