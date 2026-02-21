/**
 * Page principale de l'éditeur de graphe narratif.
 * Layout avec header, canvas, panel latéral et footer.
 */
import { memo, useCallback, useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ReactFlowProvider } from 'reactflow'
import { GraphCanvas } from '../components/graph/GraphCanvas'
import { NodeEditorPanel } from '../components/graph/NodeEditorPanel'
import { DeleteNodeConfirmModal } from '../components/graph/DeleteNodeConfirmModal'
import { useGraphStore } from '../store/graphStore'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useToast } from '../components/shared'
import { theme } from '../theme'

export const GraphEditorPage = memo(function GraphEditorPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const toast = useToast()
  
  const {
    loadDialogue,
    saveDialogue,
    validateGraph,
    updateMetadata,
    dialogueMetadata,
    validationErrors,
    isLoading,
    isSaving,
    nodes,
    edges,
    applyAutoLayout,
    selectedNodeId,
    setShowDeleteNodeConfirm,
  } = useGraphStore()
  
  const [showNodeEditor, setShowNodeEditor] = useState(true)
  const [showValidationPanel, setShowValidationPanel] = useState(false)
  
  // Charger le dialogue depuis l'état de navigation (si fourni)
  useEffect(() => {
    const dialogue = location.state?.dialogue
    if (dialogue) {
      loadDialogue(dialogue).catch((error) => {
        toast(`Erreur lors du chargement: ${error.message}`, 'error')
      })
    }
  }, [location.state, loadDialogue, toast])
  
  // Handler pour sauvegarder
  const handleSave = useCallback(async () => {
    try {
      // Flush du panneau Détails vers le store avant sauvegarde (évite perte speaker/line des nœuds manuels)
      window.dispatchEvent(new CustomEvent('flush-node-editor-form'))
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 1500)
        window.addEventListener('node-editor-flushed', () => { clearTimeout(timeout); resolve() }, { once: true })
      })
      const response = await saveDialogue()
      toast(`Dialogue sauvegardé: ${response.filename}`, 'success', 3000)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      toast(`Erreur lors de la sauvegarde: ${message}`, 'error')
    }
  }, [saveDialogue, toast])

  // Sauvegarder quand le panneau Détails envoie "request-save-dialogue" (bouton Sauvegarder du panneau)
  useEffect(() => {
    const onRequestSave = () => { handleSave() }
    window.addEventListener('request-save-dialogue', onRequestSave)
    return () => window.removeEventListener('request-save-dialogue', onRequestSave)
  }, [handleSave])
  
  // Handler pour valider
  const handleValidate = useCallback(async () => {
    try {
      await validateGraph()
      const errorCount = validationErrors.filter((e) => e.severity === 'error').length
      const warningCount = validationErrors.filter((e) => e.severity === 'warning').length
      
      if (errorCount === 0 && warningCount === 0) {
        toast('Graphe valide ✓', 'success', 2000)
      } else {
        toast(
          `Validation: ${errorCount} erreur(s), ${warningCount} avertissement(s)`,
          errorCount > 0 ? 'error' : 'warning',
          4000
        )
        setShowValidationPanel(true)
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      toast(`Erreur lors de la validation: ${msg}`, 'error')
    }
  }, [validateGraph, validationErrors, toast])
  
  // Handler pour auto-layout
  const handleAutoLayout = useCallback(async () => {
    try {
      await applyAutoLayout('dagre', 'TB')
      toast('Layout appliqué', 'success', 2000)
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      toast(`Erreur lors du layout: ${msg}`, 'error')
    }
  }, [applyAutoLayout, toast])
  
  // Handler pour exporter vers Unity
  const handleExportToUnity = useCallback(() => {
    toast('Export Unity non implémenté', 'warning', 2000)
  }, [toast])
  
  // Handler pour retour au dashboard
  const handleBack = useCallback(() => {
    navigate('/')
  }, [navigate])
  
  // Raccourcis clavier
  useKeyboardShortcuts(
    [
      {
        key: 'ctrl+s',
        handler: handleSave,
        description: 'Sauvegarder le dialogue',
        enabled: !isSaving,
      },
      {
        key: 'ctrl+l',
        handler: handleAutoLayout,
        description: 'Auto-layout',
        enabled: true,
      },
      {
        key: 'ctrl+k',
        handler: handleValidate,
        description: 'Valider le graphe',
        enabled: true,
      },
      {
        key: 'delete',
        handler: (e: KeyboardEvent) => {
          e.preventDefault()
          if (selectedNodeId) setShowDeleteNodeConfirm(true)
        },
        description: 'Supprimer le nœud sélectionné',
        enabled: !!selectedNodeId,
      },
    ],
    [handleSave, handleAutoLayout, handleValidate, isSaving, selectedNodeId, setShowDeleteNodeConfirm]
  )
  
  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: theme.background.primary,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 60,
          borderBottom: `1px solid ${theme.border.primary}`,
          backgroundColor: theme.background.secondary,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 1rem',
          gap: '1rem',
        }}
      >
        {/* Titre et bouton retour */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={handleBack}
            style={{
              padding: '0.5rem 0.75rem',
              border: `1px solid ${theme.border.primary}`,
              borderRadius: 4,
              backgroundColor: theme.button.default.background,
              color: theme.button.default.color,
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            ← Retour
          </button>
          
          <input
            type="text"
            value={dialogueMetadata.title}
            onChange={(e) => updateMetadata({ title: e.target.value })}
            style={{
              fontSize: '1.1rem',
              fontWeight: 'bold',
              color: theme.text.primary,
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              padding: '0.25rem 0.5rem',
              minWidth: 300,
            }}
            placeholder="Titre du dialogue"
          />
        </div>
        
        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={handleAutoLayout}
            style={{
              padding: '0.5rem 1rem',
              border: `1px solid ${theme.border.primary}`,
              borderRadius: 4,
              backgroundColor: theme.button.default.background,
              color: theme.button.default.color,
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
            title="Auto-layout (Ctrl+L)"
          >
            📐 Auto-layout
          </button>
          
          <button
            onClick={handleValidate}
            style={{
              padding: '0.5rem 1rem',
              border: `1px solid ${theme.border.primary}`,
              borderRadius: 4,
              backgroundColor: theme.button.default.background,
              color: theme.button.default.color,
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
            title="Valider (Ctrl+K)"
          >
            ✓ Valider
          </button>
          
          <button
            onClick={handleSave}
            disabled={isSaving}
            style={{
              padding: '0.5rem 1rem',
              border: `1px solid ${theme.border.primary}`,
              borderRadius: 4,
              backgroundColor: theme.button.primary.background,
              color: theme.button.primary.color,
              cursor: isSaving ? 'not-allowed' : 'pointer',
              fontSize: '0.9rem',
              fontWeight: 'bold',
              opacity: isSaving ? 0.6 : 1,
            }}
            title="Sauvegarder (Ctrl+S)"
          >
            {isSaving ? 'Sauvegarde...' : '💾 Sauvegarder'}
          </button>
          
          <button
            onClick={handleExportToUnity}
            style={{
              padding: '0.5rem 1rem',
              border: `1px solid ${theme.border.primary}`,
              borderRadius: 4,
              backgroundColor: '#9013FE',
              color: 'white',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 'bold',
            }}
          >
            📤 Exporter Unity
          </button>
        </div>
      </div>
      
      {/* Zone principale */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
        }}
      >
        {/* Canvas */}
        <div
          style={{
            flex: showNodeEditor ? '1 1 70%' : '1 1 100%',
            position: 'relative',
          }}
        >
          {isLoading ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: theme.text.secondary,
              }}
            >
              Chargement du graphe...
            </div>
          ) : (
            <ReactFlowProvider>
              <GraphCanvas />
            </ReactFlowProvider>
          )}
        </div>
        
        {/* Panel latéral (Node Editor + AI Generation) */}
        {showNodeEditor && (
          <div
            style={{
              flex: '0 0 30%',
              minWidth: 350,
              maxWidth: 500,
              borderLeft: `1px solid ${theme.border.primary}`,
              backgroundColor: theme.background.secondary,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header du panel */}
            <div
              style={{
                padding: '1rem',
                borderBottom: `1px solid ${theme.border.primary}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h3 style={{ margin: 0, color: theme.text.primary }}>
                Édition & Génération
              </h3>
              <button
                onClick={() => setShowNodeEditor(false)}
                style={{
                  padding: '0.25rem 0.5rem',
                  border: `1px solid ${theme.border.primary}`,
                  borderRadius: 4,
                  backgroundColor: 'transparent',
                  color: theme.text.secondary,
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                ✕
              </button>
            </div>
            
            {/* Contenu du panel */}
            <div
              style={{
                flex: 1,
                overflow: 'auto',
                padding: '1rem',
              }}
            >
              <NodeEditorPanel />
            </div>
          </div>
        )}
        
        {/* Bouton pour rouvrir le panel */}
        {!showNodeEditor && (
          <button
            onClick={() => setShowNodeEditor(true)}
            style={{
              position: 'absolute',
              right: 10,
              top: 80,
              padding: '0.5rem',
              border: `1px solid ${theme.border.primary}`,
              borderRadius: 4,
              backgroundColor: theme.background.secondary,
              color: theme.text.primary,
              cursor: 'pointer',
              fontSize: '0.9rem',
              zIndex: 10,
            }}
          >
            ⚙️ Édition
          </button>
        )}
      </div>
      
      {/* Footer */}
      <div
        style={{
          height: 40,
          borderTop: `1px solid ${theme.border.primary}`,
          backgroundColor: theme.background.secondary,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 1rem',
          fontSize: '0.85rem',
          color: theme.text.secondary,
        }}
      >
        <div>
          {nodes.length} nœud(s) · {edges.length} connexion(s)
        </div>
        
        {validationErrors.length > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer',
            }}
            onClick={() => setShowValidationPanel(!showValidationPanel)}
          >
            <span style={{ color: '#E74C3C' }}>⚠️</span>
            <span>
              {validationErrors.filter((e) => e.severity === 'error').length} erreur(s),{' '}
              {validationErrors.filter((e) => e.severity === 'warning').length}{' '}
              avertissement(s)
            </span>
          </div>
        )}
        
        <div>
          Ctrl+S: Sauvegarder · Ctrl+Z: Annuler · Ctrl+L: Auto-layout
        </div>
      </div>
      
      {/* Panel de validation (overlay) */}
      {showValidationPanel && validationErrors.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: 40,
            right: 10,
            width: 400,
            maxHeight: 300,
            backgroundColor: theme.background.secondary,
            border: `1px solid ${theme.border.primary}`,
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            overflow: 'hidden',
            zIndex: 20,
          }}
        >
          <div
            style={{
              padding: '0.75rem 1rem',
              borderBottom: `1px solid ${theme.border.primary}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: theme.background.tertiary,
            }}
          >
            <h4 style={{ margin: 0, color: theme.text.primary }}>
              Erreurs de validation
            </h4>
            <button
              onClick={() => setShowValidationPanel(false)}
              style={{
                padding: '0.25rem 0.5rem',
                border: `1px solid ${theme.border.primary}`,
                borderRadius: 4,
                backgroundColor: 'transparent',
                color: theme.text.secondary,
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              ✕
            </button>
          </div>
          
          <div
            style={{
              maxHeight: 250,
              overflow: 'auto',
              padding: '0.5rem',
            }}
          >
            {validationErrors.map((error, index) => (
              <div
                key={index}
                style={{
                  padding: '0.75rem',
                  marginBottom: '0.5rem',
                  backgroundColor: theme.background.panel,
                  borderLeft: `4px solid ${
                    error.severity === 'error' ? '#E74C3C' : '#F5A623'
                  }`,
                  borderRadius: 4,
                }}
              >
                <div
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    color: error.severity === 'error' ? '#E74C3C' : '#F5A623',
                    marginBottom: '0.25rem',
                  }}
                >
                  {error.type.toUpperCase()}
                  {error.node_id && ` - ${error.node_id}`}
                </div>
                <div
                  style={{
                    fontSize: '0.85rem',
                    color: theme.text.primary,
                  }}
                >
                  {error.message}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <DeleteNodeConfirmModal />
    </div>
  )
})
