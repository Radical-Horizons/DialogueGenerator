import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MainLayout } from './components/layout/MainLayout'
import { LoginForm } from './components/auth/LoginForm'
import { Dashboard } from './components/layout/Dashboard'
import { UnityDialoguesPage } from './components/unityDialogues/UnityDialoguesPage'
import { UsageDashboard } from './components/usage/UsageDashboard'
import { GraphEditorPage } from './pages/GraphEditorPage'
import { useAuthStore } from './store/authStore'
import { ToastContainer } from './components/shared'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { initLogging } from './utils/logging'
import { theme } from './theme'
import './App.css'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, initialize } = useAuthStore()

  // En développement, désactiver l'authentification
  const isDev = import.meta.env.DEV

  useEffect(() => {
    if (isDev) {
      // En dev, on skip l'initialisation de l'auth
      return
    }
    
    // Initialiser la session au démarrage (vérifie le token dans localStorage)
    if (import.meta.env.DEV) {
      console.log('[ProtectedRoute] Initialisation...')
    }
    initialize().then(() => {
      if (import.meta.env.DEV) {
        console.log('[ProtectedRoute] Initialisation terminée')
      }
    }).catch((error) => {
      console.error('[ProtectedRoute] Erreur lors de l\'initialisation:', error)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Exécuter une seule fois au montage

  // Log pour debug
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('[ProtectedRoute] State changé:', { isLoading, isAuthenticated, isDev })
    }
  }, [isLoading, isAuthenticated, isDev])

  // En développement, toujours autoriser l'accès
  if (isDev) {
    return <>{children}</>
  }

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

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

const queryClient = new QueryClient()

function App() {
  useEffect(() => {
    // Initialiser le système de logging au démarrage
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

