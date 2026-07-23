import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MainLayout } from './components/layout/MainLayout'
import { LoginForm } from './components/auth/LoginForm'
import { Dashboard } from './components/layout/Dashboard'
import { UnityDialoguesPage } from './components/unityDialogues/UnityDialoguesPage'
import { UsageDashboard } from './components/usage/UsageDashboard'
import { GraphEditorPage } from './pages/GraphEditorPage'
import { UserManagementPanel } from './components/admin/UserManagementPanel'
import { AuditLogsPanel } from './components/admin/AuditLogsPanel'
import { LlmModelsPanel } from './components/admin/LlmModelsPanel'
import { useAuthStore } from './store/authStore'
import { ToastContainer } from './components/shared'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { initLogging } from './utils/logging'
import { theme } from './theme'
import './App.css'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, initialize } = useAuthStore()

  useEffect(() => {
    void initialize().catch((error) => {
      console.error('[ProtectedRoute] Erreur lors de l\'initialisation:', error)
    })
  }, [initialize])

  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        backgroundColor: theme.background.primary,
        color: 'rgba(255, 255, 255, 0.87)',
      }}>
        <div>Chargement...</div>
      </div>
    )
  }

  // Guest-first : initialize pose une session guest ; /login seulement si échec total
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, initialize, fetchCurrentUser } = useAuthStore()
  const [hasResolvedAuth, setHasResolvedAuth] = useState(false)

  useEffect(() => {
    // Revalide le rôle côté API : un admin stale en localStorage ne doit pas
    // afficher la page admin si /me ne confirme plus le rôle.
    void (async () => {
      try {
        await initialize()
        await fetchCurrentUser()
      } catch (error) {
        console.error('[AdminRoute] Erreur lors de la revalidation admin:', error)
      } finally {
        setHasResolvedAuth(true)
      }
    })()
  }, [initialize, fetchCurrentUser])

  if (!hasResolvedAuth) {
    return <div role="status">Chargement de la session…</div>
  }
  if (user?.role === 'admin' && user.is_active) {
    return <>{children}</>
  }
  return <Navigate to="/" replace />
}

/**
 * Composant pour gérer les raccourcis de navigation globaux.
 */
function NavigationShortcuts() {
  const navigate = useNavigate()
  const location = useLocation()

  useKeyboardShortcuts(
    [
      {
        key: 'ctrl+1',
        handler: () => {
          if (location.pathname !== '/') {
            navigate('/')
          }
        },
        description: 'Naviguer vers Dashboard',
      },
      {
        key: 'ctrl+2',
        handler: () => {
          if (location.pathname !== '/unity-dialogues') {
            navigate('/unity-dialogues')
          }
        },
        description: 'Naviguer vers Dialogues Unity',
      },
      {
        key: 'ctrl+3',
        handler: () => {
          if (location.pathname !== '/usage') {
            navigate('/usage')
          }
        },
        description: 'Naviguer vers Usage/Statistiques',
      },
      {
        key: 'ctrl+4',
        handler: () => {
          if (location.pathname !== '/graph-editor') {
            navigate('/graph-editor')
          }
        },
        description: 'Naviguer vers Éditeur de Graphe',
      },
    ],
    [navigate, location.pathname]
  )

  return null
}

function AppRoutes() {
  return (
    <>
      <NavigationShortcuts />
      <Routes>
        <Route
          path="/login"
          element={
            <MainLayout fullWidth>
              <LoginForm />
            </MainLayout>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MainLayout>
                <Dashboard />
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/unity-dialogues"
          element={
            <ProtectedRoute>
              <MainLayout>
                <UnityDialoguesPage />
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/usage"
          element={
            <ProtectedRoute>
              <MainLayout>
                <UsageDashboard />
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/graph-editor"
          element={
            <ProtectedRoute>
              <GraphEditorPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/graph-editor/:dialogueId"
          element={
            <ProtectedRoute>
              <GraphEditorPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <AdminRoute>
              <MainLayout>
                <UserManagementPanel />
              </MainLayout>
            </AdminRoute>
          }
        />
        <Route
          path="/admin/audit-logs"
          element={
            <AdminRoute>
              <MainLayout>
                <AuditLogsPanel />
              </MainLayout>
            </AdminRoute>
          }
        />
        <Route
          path="/admin/llm-models"
          element={
            <AdminRoute>
              <MainLayout>
                <LlmModelsPanel />
              </MainLayout>
            </AdminRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

const queryClient = new QueryClient()

function App() {
  useEffect(() => {
    // Boot auth même sur /login (hors ProtectedRoute) — sinon isLoading reste true.
    void useAuthStore.getState().initialize().catch((error) => {
      console.error('[App] Erreur lors de l\'initialisation auth:', error)
    })
    initLogging()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <ToastContainer />
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App

