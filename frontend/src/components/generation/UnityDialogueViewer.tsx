/**
 * Composant pour afficher visuellement un dialogue Unity JSON.
 * Parse le JSON Unity et affiche chaque nœud de manière claire et lisible.
 */
import { memo, useMemo, useState, useCallback } from 'react'
import { theme } from '../../theme'
import type { GenerateUnityDialogueResponse } from '../../types/api'
import * as dialoguesAPI from '../../api/dialogues'
import { getErrorMessage } from '../../types/errors'
import { useToast } from '../shared'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'

interface UnityNode {
  id: string
  speaker?: string
  line?: string
  choices?: Array<{
    text: string
    targetNode?: string
    test?: string
    condition?: string
    traitRequirements?: Array<{
      trait: string
      minValue: number
    }>
    influenceDelta?: number
    respectDelta?: number
    [key: string]: unknown
  }>
  nextNode?: string
  test?: string
  successNode?: string
  failureNode?: string
  [key: string]: unknown
}

interface UnityDialogueViewerProps {
  response: GenerateUnityDialogueResponse
  onExport?: (filename: string) => void
}

export const UnityDialogueViewer = memo(function UnityDialogueViewer({
  response,
  onExport,
}: UnityDialogueViewerProps) {
  const toast = useToast()
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())

  // Parser le JSON Unity
  const nodes = useMemo<UnityNode[]>(() => {
    try {
      const parsed = JSON.parse(response.json_content)
      if (!Array.isArray(parsed)) {
        throw new Error('Le JSON Unity doit être un tableau de nœuds')
      }
      return parsed as UnityNode[]
    } catch (error) {
      console.error('Erreur lors du parsing du JSON Unity:', error)
      return []
    }
  }, [response.json_content])

  const toggleNodeExpanded = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }, [])

  const handleExport = useCallback(async () => {
    try {
      const result = await dialoguesAPI.exportUnityDialogue({
        json_content: response.json_content,
        title: response.title || 'Dialogue Unity',
      })
      toast(`Dialogue Unity exporté avec succès: ${result.filename}`, 'success', 5000)
      onExport?.(result.filename)
    } catch (err) {
      toast(`Erreur lors de l'export: ${getErrorMessage(err)}`, 'error')
    }
  }, [response, toast, onExport])

  const handleCopyJson = useCallback(() => {
    navigator.clipboard.writeText(response.json_content)
    toast('JSON copié dans le presse-papier', 'success', 2000)
  }, [response.json_content, toast])

  // Raccourcis clavier
  useKeyboardShortcuts(
    [
      {
        key: 'ctrl+c',
        handler: () => {
          handleCopyJson()
        },
        description: 'Copier le JSON Unity',
        enabled: nodes.length > 0,
      },
      {
        key: 'ctrl+e',
        handler: () => {
          handleExport()
        },
        description: 'Exporter le dialogue Unity',
        enabled: nodes.length > 0,
      },
    ],
    [handleCopyJson, handleExport, nodes.length]
  )

  if (nodes.length === 0) {
    return (
      <div
        style={{
          padding: '2rem',
          textAlign: 'center',
          color: theme.text.secondary,
        }}
      >
        Aucun dialogue à afficher (JSON invalide ou vide)
      </div>
    )
  }

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: theme.background.panel,
      }}
    >
      {/* En-tête avec titre et actions */}
      <div
        style={{
          padding: '1rem',
          borderBottom: `1px solid ${theme.border.primary}`,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          backgroundColor: theme.background.secondary,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
          <h3 style={{ margin: 0, color: theme.text.primary }}>
            {response.title || 'Dialogue Unity'}
          </h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleExport}
              style={{
                padding: '0.5rem 1rem',
                border: `1px solid ${theme.border.primary}`,
                borderRadius: '4px',
                backgroundColor: theme.button.primary.background,
                color: theme.button.primary.color,
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
              }}
            >
              Exporter vers Unity
            </button>
          </div>
        </div>

        {/* Bouton Copier placé sous le titre */}
        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <button
            onClick={handleCopyJson}
            style={{
              padding: '0.5rem 1rem',
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '4px',
              backgroundColor: theme.button.default.background,
              color: theme.button.default.color,
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            Copier JSON
          </button>
        </div>

        <details
          style={{
            fontSize: '0.78rem',
            color: theme.text.secondary,
            lineHeight: 1.45,
          }}
        >
          <summary style={{ cursor: 'pointer', fontWeight: 600, color: theme.text.primary }}>
            Où voir les stats du PJ et la réputation ?
          </summary>
          <p style={{ margin: '0.45rem 0 0' }}>
            Ce JSON liste surtout textes et effets de choix. Pour simuler attributs, compétences, effort et
            axes de réputation pendant la relecture, utilisez l&apos;éditeur de graphe : panneau de conditions
            et simulation (pas ce viewer seul).
          </p>
        </details>
      </div>

      {/* Liste des nœuds */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem',
        }}
      >
        {nodes.map((node) => {
          const isExpanded = expandedNodes.has(node.id)
          const hasAdvancedOptions =
            node.test ||
            node.successNode ||
            node.failureNode ||
            node.choices?.some((c) => c.test || c.condition || c.traitRequirements || c.influenceDelta !== undefined || c.respectDelta !== undefined)

          return (
            <div
              key={node.id}
              style={{
                marginBottom: '1.5rem',
                border: `1px solid ${theme.border.primary}`,
                borderRadius: '8px',
                backgroundColor: theme.background.tertiary,
                overflow: 'hidden',
              }}
            >
              {/* En-tête du nœud */}
              <div
                style={{
                  padding: '0.75rem 1rem',
                  backgroundColor: theme.background.secondary,
                  borderBottom: `1px solid ${theme.border.primary}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '0.85rem',
                      fontWeight: 'bold',
                      color: theme.text.secondary,
                      backgroundColor: theme.background.panel,
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                    }}
                  >
                    {node.id}
                  </span>
                  {node.speaker && (
                    <span
                      style={{
                        padding: '0.25rem 0.75rem',
                        backgroundColor: theme.button.primary.background,
                        color: theme.button.primary.color,
                        borderRadius: '12px',
                        fontSize: '0.85rem',
                        fontWeight: '500',
                      }}
                    >
                      {node.speaker}
                    </span>
                  )}
                </div>
                {hasAdvancedOptions && (
                  <button
                    onClick={() => toggleNodeExpanded(node.id)}
                    style={{
                      padding: '0.25rem 0.5rem',
                      border: `1px solid ${theme.border.primary}`,
                      borderRadius: '4px',
                      backgroundColor: 'transparent',
                      color: theme.text.secondary,
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                    }}
                  >
                    {isExpanded ? '▼' : '▶'} Options
                  </button>
                )}
              </div>

              {/* Contenu du nœud */}
              <div style={{ padding: '1rem' }}>
                {/* Ligne de dialogue */}
                {node.line && (
                  <div
                    style={{
                      marginBottom: node.choices && node.choices.length > 0 ? '1rem' : '0',
                      padding: '1rem',
                      backgroundColor: theme.background.panel,
                      borderRadius: '4px',
                      borderLeft: `4px solid ${theme.button.primary.background}`,
                    }}
                  >
                    <div
                      style={{
                        fontSize: '1rem',
                        lineHeight: '1.6',
                        color: theme.text.primary,
                        whiteSpace: 'pre-wrap',
                        wordWrap: 'break-word',
                      }}
                    >
                      {node.line}
                    </div>
                  </div>
                )}

                {/* Choix du joueur */}
                {node.choices && node.choices.length > 0 && (
                  <div style={{ marginTop: '1rem' }}>
                    <div
                      style={{
                        fontSize: '0.85rem',
                        fontWeight: 'bold',
                        color: theme.text.secondary,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Choix du joueur :
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {node.choices.map((choice, choiceIndex) => (
                        <div
                          key={choiceIndex}
                          style={{
                            padding: '0.75rem 1rem',
                            backgroundColor: theme.background.panel,
                            border: `1px solid ${theme.border.primary}`,
                            borderRadius: '6px',
                            borderLeft: `4px solid ${theme.border.focus}`,
                          }}
                        >
                          <div
                            style={{
                              fontSize: '0.95rem',
                              color: theme.text.primary,
                              marginBottom: (choice.targetNode || choice.test || choice.condition || choice.traitRequirements || choice.influenceDelta !== undefined || choice.respectDelta !== undefined) ? '0.75rem' : '0',
                              lineHeight: '1.5',
                            }}
                          >
                            {choice.text}
                          </div>
                          {(choice.targetNode || choice.test || choice.condition || choice.traitRequirements || choice.influenceDelta !== undefined || choice.respectDelta !== undefined) && (
                            <div
                              style={{
                                marginTop: '0.75rem',
                                padding: '0.75rem',
                                backgroundColor: theme.background.secondary,
                                borderRadius: '4px',
                                border: `1px solid ${theme.border.primary}`,
                              }}
                            >
                              <div style={{ 
                                fontSize: '0.7rem', 
                                fontWeight: 'bold', 
                                color: theme.text.secondary, 
                                marginBottom: '0.5rem',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                              }}>
                                Propriétés mécaniques
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8rem' }}>
                                {choice.test && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ color: theme.text.secondary, minWidth: '80px' }}>Test:</span>
                                    <span style={{ fontFamily: 'monospace', color: theme.text.primary, fontWeight: 500 }}>
                                      {choice.test}
                                    </span>
                                  </div>
                                )}
                                {choice.condition && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ color: theme.text.secondary, minWidth: '80px' }}>Condition:</span>
                                    <span style={{ fontFamily: 'monospace', color: theme.text.primary, fontWeight: 500 }}>
                                      {choice.condition}
                                    </span>
                                  </div>
                                )}
                                {choice.traitRequirements && choice.traitRequirements.length > 0 && (
                                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                                    <span style={{ color: theme.text.secondary, minWidth: '80px' }}>Traits requis:</span>
                                    <span style={{ color: theme.text.primary }}>
                                      {choice.traitRequirements.map((tr, i) => (
                                        <span key={i} style={{ fontFamily: 'monospace' }}>
                                          {tr.trait} ≥ {tr.minValue}
                                          {i < choice.traitRequirements!.length - 1 ? ', ' : ''}
                                        </span>
                                      ))}
                                    </span>
                                  </div>
                                )}
                                {choice.influenceDelta !== undefined && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ color: theme.text.secondary, minWidth: '80px' }}>Influence:</span>
                                    <span style={{ 
                                      fontFamily: 'monospace', 
                                      color: choice.influenceDelta >= 0 ? '#4CAF50' : '#F44336',
                                      fontWeight: 'bold',
                                    }}>
                                      {choice.influenceDelta >= 0 ? '+' : ''}{choice.influenceDelta}
                                    </span>
                                  </div>
                                )}
                                {choice.respectDelta !== undefined && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ color: theme.text.secondary, minWidth: '80px' }}>Respect:</span>
                                    <span style={{ 
                                      fontFamily: 'monospace', 
                                      color: choice.respectDelta >= 0 ? '#4CAF50' : '#F44336',
                                      fontWeight: 'bold',
                                    }}>
                                      {choice.respectDelta >= 0 ? '+' : ''}{choice.respectDelta}
                                    </span>
                                  </div>
                                )}
                                {choice.targetNode && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem', paddingTop: '0.5rem', borderTop: `1px solid ${theme.border.primary}` }}>
                                    <span style={{ color: theme.text.secondary, minWidth: '80px' }}>Cible:</span>
                                    <span style={{ fontFamily: 'monospace', color: theme.text.primary, fontWeight: 500 }}>
                                      → {choice.targetNode}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Navigation linéaire (nextNode) */}
                {!node.choices && node.nextNode && (
                  <div
                    style={{
                      marginTop: '1rem',
                      padding: '0.5rem',
                      backgroundColor: theme.background.panel,
                      borderRadius: '4px',
                      fontSize: '0.85rem',
                      color: theme.text.secondary,
                      fontFamily: 'monospace',
                    }}
                  >
                    → Suivant: {node.nextNode}
                  </div>
                )}

                {/* Options avancées (collapsible) */}
                {hasAdvancedOptions && isExpanded && (
                  <div
                    style={{
                      marginTop: '1rem',
                      padding: '1rem',
                      backgroundColor: theme.background.panel,
                      borderRadius: '4px',
                      border: `1px solid ${theme.border.primary}`,
                      fontSize: '0.85rem',
                    }}
                  >
                    <div style={{ fontWeight: 'bold', color: theme.text.secondary, marginBottom: '0.5rem' }}>
                      Options avancées :
                    </div>
                    {node.test && (
                      <div style={{ marginBottom: '0.5rem' }}>
                        <strong>Test d'attribut:</strong> {node.test}
                      </div>
                    )}
                    {node.successNode && (
                      <div style={{ marginBottom: '0.5rem' }}>
                        <strong>Nœud succès:</strong>{' '}
                        <span style={{ fontFamily: 'monospace' }}>{node.successNode}</span>
                      </div>
                    )}
                    {node.failureNode && (
                      <div style={{ marginBottom: '0.5rem' }}>
                        <strong>Nœud échec:</strong>{' '}
                        <span style={{ fontFamily: 'monospace' }}>{node.failureNode}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Fin de dialogue (pas de choix ni nextNode) */}
                {!node.choices && !node.nextNode && (
                  <div
                    style={{
                      marginTop: '1rem',
                      padding: '0.5rem',
                      textAlign: 'center',
                      fontSize: '0.85rem',
                      color: theme.text.secondary,
                      fontStyle: 'italic',
                    }}
                  >
                    Fin du dialogue
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer avec infos */}
      {(response.prompt_used || response.estimated_tokens || response.warning) && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderTop: `1px solid ${theme.border.primary}`,
            backgroundColor: theme.background.secondary,
            fontSize: '0.85rem',
            color: theme.text.secondary,
          }}
        >
          {response.warning && (
            <div style={{ color: theme.state.error.color, marginBottom: '0.25rem' }}>
              ⚠️ {response.warning}
            </div>
          )}
          {response.estimated_tokens && (
            <div>Tokens estimés: {response.estimated_tokens.toLocaleString()}</div>
          )}
        </div>
      )}
    </div>
  )
})



