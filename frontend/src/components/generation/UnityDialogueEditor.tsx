/**
 * Éditeur Unity JSON pour dialogues (édition partielle + round-trip).
 * Permet d'éditer speaker, line, choices[].text, choices[].targetNode.
 * Préserve tous les autres champs en lecture seule.
 */
import { memo, useState, useEffect, useCallback, useMemo, useImperativeHandle, forwardRef, type ReactNode } from 'react'
import * as dialoguesAPI from '../../api/dialogues'
import { getErrorMessage } from '../../types/errors'
import { theme } from '../../theme'
import { unityDialogueEditorChrome } from '../../theme/responsiveChrome'
import { useToast } from '../shared'
import { useDialogueEditionNarrow } from '../unityDialogues/DialogueEditionNarrowContext'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { useNarrowInlineSize } from '../../hooks/useNarrowInlineSize'
import type {
  UnityDialogueNode,
  UnityDialogueChoice,
  ExportUnityDialogueRequest,
} from '../../types/api'

export interface UnityDialogueEditorProps {
  json_content: string
  title?: string
  subtitle?: string
  filename?: string
  onSave?: (filename: string) => void
  onCancel?: () => void
  extraActions?: ReactNode
  hideHeaderSaveButton?: boolean
  /**
   * Slot optionnel placé dans la zone titre du header (Story 17.7).
   * Utilisé en mode narrow pour héberger un sélecteur de dialogue (`DialogueCombobox`)
   * — le mode desktop conserve la liste latérale et n'utilise pas ce slot.
   */
  headerSelector?: ReactNode
}

export interface UnityDialogueEditorHandle {
  handleSave: () => Promise<void>
  isValid: boolean
  isSaving: boolean
}

interface ValidationError {
  nodeId?: string
  choiceIndex?: number
  message: string
}

export const UnityDialogueEditor = memo(forwardRef<UnityDialogueEditorHandle, UnityDialogueEditorProps>(function UnityDialogueEditor({
  json_content,
  title,
  subtitle,
  filename,
  onSave,
  onCancel,
  extraActions,
  hideHeaderSaveButton = false,
  headerSelector,
}, ref) {
  const toast = useToast()
  const isNarrow = useDialogueEditionNarrow()
  const chrome = isNarrow ? unityDialogueEditorChrome.narrow : unityDialogueEditorChrome.comfortable
  const { ref: actionsRef, isNarrow: isActionsNarrowMeasured } = useNarrowInlineSize(520)
  const isActionsNarrow = isNarrow && isActionsNarrowMeasured
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedAdvanced, setExpandedAdvanced] = useState<Set<string>>(new Set())

  // Parser et état local des nœuds
  const [nodes, setNodes] = useState<UnityDialogueNode[]>(() => {
    try {
      const parsed = JSON.parse(json_content)
      if (!Array.isArray(parsed)) {
        throw new Error('Le JSON Unity doit être un tableau de nœuds')
      }
      return parsed as UnityDialogueNode[]
    } catch (error) {
      console.error('Erreur lors du parsing du JSON Unity:', error)
      return []
    }
  })

  // Mettre à jour les nœuds quand json_content change
  useEffect(() => {
    try {
      const parsed = JSON.parse(json_content)
      if (!Array.isArray(parsed)) {
        throw new Error('Le JSON Unity doit être un tableau de nœuds')
      }
      setNodes(parsed as UnityDialogueNode[])
      setError(null)
    } catch (error) {
      console.error('Erreur lors du parsing du JSON Unity:', error)
      setNodes([])
      setError('Erreur lors du parsing du JSON Unity')
    }
  }, [json_content])

  // Validation légère pour UX uniquement (feedback immédiat)
  // La validation complète est effectuée par le backend (UnityJsonRenderer.validate_nodes)
  // Le backend rejettera avec un message clair si le dialogue est invalide
  const validationErrors = useMemo<ValidationError[]>(() => {
    const errors: ValidationError[] = []
    
    // Validation minimale pour UX uniquement :
    // - Vérifier que les IDs sont présents (sinon impossible de sauvegarder)
    // - Pas de validation des références (backend le fait)
    for (const node of nodes) {
      if (!node.id || node.id.trim() === '') {
        errors.push({ nodeId: node.id || '?', message: 'ID manquant' })
      }
    }

    return errors
  }, [nodes])

  // isValid basé uniquement sur validation UX légère
  // Le backend validera complètement lors de la sauvegarde
  const isValid = validationErrors.length === 0

  // Mettre à jour un nœud (par ID, pas par index)
  const updateNode = useCallback((nodeId: string, updates: Partial<UnityDialogueNode>) => {
    setNodes((prev) => {
      return prev.map((node) => (node.id === nodeId ? { ...node, ...updates } : node))
    })
  }, [])

  // Mettre à jour le speaker d'un nœud
  const updateNodeSpeaker = useCallback(
    (nodeId: string, speaker: string) => {
      updateNode(nodeId, { speaker: speaker.trim() || undefined })
    },
    [updateNode]
  )

  // Mettre à jour le line d'un nœud
  const updateNodeLine = useCallback(
    (nodeId: string, line: string) => {
      updateNode(nodeId, { line: line.trim() || undefined })
    },
    [updateNode]
  )

  // Mettre à jour un choix (par nodeId, pas par index)
  const updateChoice = useCallback(
    (nodeId: string, choiceIndex: number, updates: Partial<UnityDialogueChoice>) => {
      setNodes((prev) => {
        return prev.map((node) => {
          if (node.id !== nodeId) return node
        const choices = [...(node.choices || [])]
        choices[choiceIndex] = { ...choices[choiceIndex], ...updates }
          return { ...node, choices }
        })
      })
    },
    []
  )

  // Ajouter un choix (par nodeId, pas par index)
  const addChoice = useCallback(
    (nodeId: string) => {
      setNodes((prev) => {
        return prev.map((node) => {
          if (node.id !== nodeId) return node
        const choices = [...(node.choices || [])]
          choices.push({ text: '', targetNode: 'END' })
          return { ...node, choices }
        })
      })
    },
    []
  )

  // Supprimer un choix (par nodeId, pas par index)
  const removeChoice = useCallback((nodeId: string, choiceIndex: number) => {
    setNodes((prev) => {
      return prev.map((node) => {
        if (node.id !== nodeId) return node
      const choices = [...(node.choices || [])]
      choices.splice(choiceIndex, 1)
        return { ...node, choices: choices.length > 0 ? choices : undefined }
      })
    })
  }, [])

  // Sauvegarder
  const handleSave = useCallback(async () => {
    // Validation minimale côté frontend (IDs présents) - la validation complète est faite par le backend
    if (!isValid) {
      setError('Corrigez les erreurs de validation avant de sauvegarder')
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      // Reconstruire le JSON (préserver tous les champs, y compris ceux non édités)
      const jsonContent = JSON.stringify(nodes, null, 2)

      const request: ExportUnityDialogueRequest = {
        json_content: jsonContent,
        title: title || 'Dialogue Unity',
        filename: filename, // Si on édite un fichier existant, réutiliser le filename
      }

      // Le backend validera le schéma Unity (IDs uniques, références valides, etc.)
      const result = await dialoguesAPI.exportUnityDialogue(request)
      toast(`Dialogue sauvegardé: ${result.filename}`, 'success', 5000)
      onSave?.(result.filename)
    } catch (err) {
      // Le backend retournera une ValidationException avec les détails si le dialogue est invalide
      const errorMessage = getErrorMessage(err)
      setError(errorMessage)
      toast(`Erreur lors de la sauvegarde: ${errorMessage}`, 'error')
    } finally {
      setIsSaving(false)
    }
  }, [isValid, nodes, title, filename, toast, onSave])

  // Exposer handleSave, isValid et isSaving via ref
  useImperativeHandle(ref, () => ({
    handleSave,
    isValid,
    isSaving,
  }), [handleSave, isValid, isSaving])

  // Raccourcis clavier
  useKeyboardShortcuts(
    [
      {
        key: 'ctrl+s',
        handler: (e) => {
          e.preventDefault()
          if (isValid && !isSaving) {
            handleSave()
          }
        },
        description: 'Sauvegarder le dialogue Unity',
        enabled: isValid && !isSaving,
      },
      {
        key: 'ctrl+e',
        handler: (e) => {
          e.preventDefault()
          if (isValid && !isSaving) {
            handleSave() // Dans l'éditeur, Ctrl+E sauvegarde (export)
          }
        },
        description: 'Exporter/Sauvegarder le dialogue Unity',
        enabled: isValid && !isSaving,
      },
    ],
    [isValid, isSaving, handleSave]
  )

  // Toggle collapse pour options avancées
  const toggleAdvanced = useCallback((nodeId: string) => {
    setExpandedAdvanced((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }, [])

  // Obtenir les erreurs pour un nœud spécifique
  const getNodeErrors = useCallback(
    (nodeId: string) => {
      return validationErrors.filter((e) => e.nodeId === nodeId)
    },
    [validationErrors]
  )

  // Obtenir les IDs de nœuds pour autocomplétion (inclut "END" pour terminer le dialogue)
  const nodeIds = useMemo(() => {
    const ids = new Set(nodes.map((n) => n.id))
    ids.add('END') // Ajouter "END" comme option valide pour terminer le dialogue
    return ids
  }, [nodes])

  // Filtrer le nœud "END" de l'affichage : ce n'est pas un vrai nœud éditable,
  // c'est juste un marqueur de fin géré implicitement par Unity
  const displayableNodes = useMemo(() => {
    return nodes.filter((node) => node.id !== 'END')
  }, [nodes])

  if (displayableNodes.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: theme.text.secondary }}>
        Aucun dialogue à éditer (JSON invalide ou vide)
      </div>
    )
  }

  return (
    <div style={{ 
      flex: 1,
      minHeight: 0,
      maxHeight: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: theme.background.panel,
      overflow: 'hidden',
    }}>
      {/* En-tête sticky */}
      <div
        data-testid="unity-dialogue-editor-toolbar"
        data-dialogue-edition-narrow={isNarrow ? 'true' : 'false'}
        style={{
          flexShrink: 0,
          padding: chrome.headerPadding,
          borderBottom: `1px solid ${theme.border.primary}`,
          backgroundColor: theme.background.panelHeader,
          display: 'flex',
          flexDirection: isNarrow ? 'column' : 'row',
          gap: `${chrome.headerLayoutGapRem}rem`,
          alignItems: isNarrow ? 'stretch' : 'center',
          justifyContent: 'flex-start',
          flexWrap: isNarrow ? 'nowrap' : 'wrap',
        }}
      >
        <div style={{ minWidth: 0, flex: isNarrow ? undefined : '0 1 auto' }}>
          {headerSelector && (
            <div
              data-testid="unity-dialogue-editor-header-selector"
              style={{ marginBottom: '0.4rem' }}
            >
              {headerSelector}
            </div>
          )}
          <div
            style={{
              margin: 0,
              color: theme.text.primary,
              fontSize: `${chrome.titleFontRem}rem`,
              fontWeight: 700,
              lineHeight: 1.25,
              wordBreak: 'break-word',
            }}
          >
            {title || 'Éditeur de Dialogue Unity'}
          </div>
          {subtitle && (
            <div
              style={{
                fontSize: `${chrome.subtitleFontRem}rem`,
                color: theme.text.secondary,
                marginTop: `${chrome.subtitleMarginTopRem}rem`,
              }}
            >
              {subtitle}
            </div>
          )}
        </div>

        <div
          style={{
            // flex: 1 remplace le width:100% initial : le wrapper remplit l'espace restant
            // après le titre (qui est flex: 0 1 auto), ce qui évite le shrink-wrap (≈222px)
            // tout en laissant les boutons s'aligner à gauche via justifyContent: flex-start.
            flex: isNarrow ? undefined : '1 1 auto',
            width: isNarrow ? '100%' : undefined,
            maxWidth: '100%',
            minWidth: 0,
            alignSelf: 'stretch',
            display: 'block',
          }}
          ref={actionsRef}
        >
          <div
            className="unity-dialogue-toolbar-actions"
            data-actions-narrow={isActionsNarrow ? 'true' : 'false'}
            style={{
              display: isActionsNarrow ? 'grid' : 'flex',
              gridTemplateColumns: isActionsNarrow ? 'minmax(0, 1fr) minmax(0, 1fr)' : undefined,
              gridTemplateAreas: isActionsNarrow ? '"generate delete" "save cancel"' : undefined,
              gap: `${chrome.toolbarGapRem}rem`,
              alignItems: isActionsNarrow ? 'stretch' : 'center',
              justifyItems: isActionsNarrow ? 'stretch' : undefined,
              flexWrap: isActionsNarrow ? undefined : isNarrow ? 'wrap' : 'nowrap',
              justifyContent: isActionsNarrow ? undefined : 'flex-start',
              minWidth: 0,
              width: '100%',
              maxWidth: '100%',
              overflowX: isActionsNarrow ? undefined : isNarrow ? undefined : 'auto',
              overflowY: 'hidden',
            }}
          >
            {extraActions}
            {!hideHeaderSaveButton && (
              <button
                onClick={handleSave}
                disabled={isSaving || !isValid}
                style={{
                  gridArea: isActionsNarrow ? 'save' : undefined,
                  flexShrink: isActionsNarrow ? undefined : 0,
                  padding: chrome.toolbarButtonPadding,
                  fontSize: `${chrome.toolbarButtonFontRem}rem`,
                  fontWeight: chrome.toolbarButtonFontWeight,
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: theme.button.primary.background,
                  color: theme.button.primary.color,
                  cursor: isValid && !isSaving ? 'pointer' : 'not-allowed',
                  opacity: isValid && !isSaving ? 1 : 0.6,
                  boxSizing: 'border-box',
                  width: isActionsNarrow ? '100%' : undefined,
                  minWidth: isActionsNarrow ? 0 : undefined,
                }}
              >
                {isSaving ? 'Sauvegarde...' : 'Sauvegarder'}
              </button>
            )}
            {onCancel && (
              <button
                onClick={onCancel}
                style={{
                  gridArea: isActionsNarrow ? 'cancel' : undefined,
                  flexShrink: isActionsNarrow ? undefined : 0,
                  padding: chrome.toolbarButtonPadding,
                  fontSize: `${chrome.toolbarButtonFontRem}rem`,
                  fontWeight: chrome.toolbarButtonFontWeight,
                  border: `1px solid ${theme.border.primary}`,
                  borderRadius: '6px',
                  backgroundColor: theme.button.default.background,
                  color: theme.button.default.color,
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                  width: isActionsNarrow ? '100%' : undefined,
                  minWidth: isActionsNarrow ? 0 : undefined,
                }}
              >
                Annuler
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Contenu scrollable */}
      <div
        data-testid="unity-dialogue-editor-content"
        style={{
          flex: '1 1 0%',
          minHeight: 0,
          minWidth: 0,
          height: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: chrome.contentPadding,
          boxSizing: 'border-box',
          scrollbarGutter: 'stable',
        }}
      >
        {/* Erreurs de validation */}
        {!isValid && (
          <div
            style={{
              padding: '0.75rem',
              marginBottom: '1rem',
              backgroundColor: theme.state.error.background,
              color: theme.state.error.color,
              borderRadius: '6px',
              border: `1px solid ${theme.border.primary}`,
            }}
          >
            <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Erreurs de validation:</div>
            <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
              {validationErrors.map((err, i) => (
                <li key={i} style={{ marginBottom: '0.25rem' }}>
                  {err.nodeId && `[${err.nodeId}] `}
                  {err.choiceIndex !== undefined && `Choix ${err.choiceIndex + 1}: `}
                  {err.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Erreur générale */}
        {error && (
          <div
            style={{
              padding: '0.75rem',
              marginBottom: '1rem',
              backgroundColor: theme.state.error.background,
              color: theme.state.error.color,
              borderRadius: '6px',
              border: `1px solid ${theme.border.primary}`,
            }}
          >
            {error}
          </div>
        )}

        {/* Liste des nœuds (END est filtré car ce n'est pas un vrai nœud éditable) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {displayableNodes.map((node) => {
          const nodeErrors = getNodeErrors(node.id)
          const isAdvancedExpanded = expandedAdvanced.has(node.id)

          return (
            <div
              key={node.id}
              style={{
                border: `1px solid ${theme.border.primary}`,
                borderRadius: '6px',
                padding: chrome.nodeCardPadding,
                backgroundColor: theme.background.panel,
                minWidth: 0,
              }}
            >
              {/* En-tête du nœud */}
              <div
                style={{
                  marginBottom: '1rem',
                  paddingBottom: '0.5rem',
                  borderBottom: `1px solid ${theme.border.primary}`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '0.9rem',
                        backgroundColor: theme.background.secondary,
                        padding: '0.25rem 0.5rem',
                        borderRadius: '6px',
                        color: theme.text.primary,
                      }}
                    >
                      ID: {node.id}
                    </span>
                    {nodeErrors.length > 0 && (
                      <span
                        style={{
                          marginLeft: '0.5rem',
                          color: theme.state.error.color,
                          fontSize: '0.85rem',
                        }}
                      >
                        ({nodeErrors.length} erreur{nodeErrors.length > 1 ? 's' : ''})
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Speaker (éditable) */}
              <div style={{ marginBottom: '1rem' }}>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '0.5rem',
                    color: theme.text.primary,
                    fontSize: `${chrome.labelFontRem}rem`,
                    fontWeight: 500,
                  }}
                >
                  Speaker (ID du personnage):
                </label>
                <input
                  type="text"
                  value={node.speaker || ''}
                  onChange={(e) => updateNodeSpeaker(node.id, e.target.value)}
                  placeholder="ex: NPC_1, Player, Narrator"
                  style={{
                    width: '100%',
                    minWidth: 0,
                    padding: chrome.inputPadding,
                    boxSizing: 'border-box',
                    backgroundColor: theme.input.background,
                    border: `1px solid ${theme.input.border}`,
                    color: theme.input.color,
                    borderRadius: '4px',
                  }}
                />
              </div>

              {/* Line (éditable) */}
              <div style={{ marginBottom: '1rem' }}>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '0.5rem',
                    color: theme.text.primary,
                    fontSize: `${chrome.labelFontRem}rem`,
                    fontWeight: 500,
                  }}
                >
                  Dialogue (texte):
                </label>
                <textarea
                  value={node.line || ''}
                  onChange={(e) => updateNodeLine(node.id, e.target.value)}
                  placeholder="Texte du dialogue..."
                  rows={5}
                  style={{
                    width: '100%',
                    minWidth: 0,
                    padding: chrome.inputPadding,
                    boxSizing: 'border-box',
                    backgroundColor: theme.input.background,
                    border: `1px solid ${theme.input.border}`,
                    color: theme.input.color,
                    borderRadius: '4px',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                  }}
                />
              </div>

              {/* Choices (éditables) */}
              {node.choices && node.choices.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '0.5rem',
                      color: theme.text.primary,
                      fontSize: '0.9rem',
                      fontWeight: 500,
                    }}
                  >
                    Choix du joueur:
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {node.choices.map((choice, choiceIndex) => {
                      const choiceErrors = nodeErrors.filter((e) => e.choiceIndex === choiceIndex)
                      return (
                        <div
                          key={choiceIndex}
                          style={{
                            padding: '0.75rem',
                            border: `1px solid ${theme.border.primary}`,
                            borderRadius: '6px',
                            backgroundColor: theme.background.secondary,
                          }}
                        >
                          <div style={{ marginBottom: '0.5rem' }}>
                            <label
                              style={{
                                display: 'block',
                                marginBottom: '0.25rem',
                                color: theme.text.primary,
                                fontSize: '0.85rem',
                              }}
                            >
                              Texte du choix:
                            </label>
                            <textarea
                              value={choice.text}
                              onChange={(e) =>
                                updateChoice(node.id, choiceIndex, { text: e.target.value })
                              }
                              placeholder="Texte du choix..."
                              rows={3}
                              style={{
                                width: '100%',
                                padding: '0.5rem',
                                boxSizing: 'border-box',
                                backgroundColor: theme.input.background,
                                border: `1px solid ${
                                  choiceErrors.some((e) => e.message.includes('texte'))
                                    ? theme.state.error.border
                                    : theme.input.border
                                }`,
                                color: theme.input.color,
                                borderRadius: '6px',
                                fontFamily: 'inherit',
                                resize: 'vertical',
                              }}
                            />
                          </div>

                          {/* Propriétés mécaniques - ÉDITABLES */}
                          <div
                            style={{
                              marginBottom: '0.75rem',
                              padding: '0.75rem',
                              backgroundColor: theme.background.panel,
                              borderRadius: '6px',
                              border: `1px solid ${theme.border.primary}`,
                            }}
                          >
                            <div style={{ 
                              fontSize: '0.8rem', 
                              fontWeight: 'bold', 
                              color: theme.text.secondary, 
                              marginBottom: '0.75rem',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                            }}>
                              Propriétés mécaniques
                            </div>
                            
                            {/* Test et Condition sur une ligne */}
                            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
                              <div style={{ flex: 1 }}>
                                <label
                                  style={{
                                    display: 'block',
                                    marginBottom: '0.25rem',
                                    fontSize: '0.8rem',
                                    fontWeight: 500,
                                    color: theme.text.primary,
                                  }}
                                >
                                  Test d'attribut
                                </label>
                                <input
                                  type="text"
                                  value={choice.test || ''}
                                  onChange={(e) =>
                                    updateChoice(node.id, choiceIndex, {
                                      test: e.target.value.trim() || undefined,
                                    })
                                  }
                                  placeholder="Raison+Diplomatie:8"
                                  style={{
                                    width: '100%',
                                    padding: '0.5rem',
                                    boxSizing: 'border-box',
                                    backgroundColor: theme.input.background,
                                    border: `1px solid ${theme.input.border}`,
                                    color: theme.input.color,
                                    borderRadius: '4px',
                                    fontSize: '0.85rem',
                                    fontFamily: 'monospace',
                                  }}
                                />
                              </div>
                              <div style={{ flex: 1 }}>
                                <label
                                  style={{
                                    display: 'block',
                                    marginBottom: '0.25rem',
                                    fontSize: '0.8rem',
                                    fontWeight: 500,
                                    color: theme.text.primary,
                                  }}
                                >
                                  Condition
                                </label>
                                <input
                                  type="text"
                                  value={choice.condition || ''}
                                  onChange={(e) =>
                                    updateChoice(node.id, choiceIndex, {
                                      condition: e.target.value.trim() || undefined,
                                    })
                                  }
                                  placeholder="FLAG_NAME"
                                  style={{
                                    width: '100%',
                                    padding: '0.5rem',
                                    boxSizing: 'border-box',
                                    backgroundColor: theme.input.background,
                                    border: `1px solid ${theme.input.border}`,
                                    color: theme.input.color,
                                    borderRadius: '4px',
                                    fontSize: '0.85rem',
                                    fontFamily: 'monospace',
                                  }}
                                />
                              </div>
                            </div>

                            {/* Modificateurs d'influence et respect */}
                            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
                              <div style={{ flex: 1 }}>
                                <label
                                  style={{
                                    display: 'block',
                                    marginBottom: '0.25rem',
                                    fontSize: '0.8rem',
                                    fontWeight: 500,
                                    color: theme.text.primary,
                                  }}
                                >
                                  Influence
                                </label>
                                <input
                                  type="number"
                                  value={choice.influenceDelta ?? ''}
                                  onChange={(e) => {
                                    const value = e.target.value === '' ? undefined : parseInt(e.target.value, 10)
                                    updateChoice(node.id, choiceIndex, {
                                      influenceDelta: isNaN(value as number) ? undefined : value,
                                    })
                                  }}
                                  placeholder="+1, -1, 0"
                                  style={{
                                    width: '100%',
                                    padding: '0.5rem',
                                    boxSizing: 'border-box',
                                    backgroundColor: theme.input.background,
                                    border: `1px solid ${theme.input.border}`,
                                    color: choice.influenceDelta !== undefined && choice.influenceDelta >= 0 ? '#4CAF50' : choice.influenceDelta !== undefined ? '#F44336' : theme.input.color,
                                    borderRadius: '4px',
                                    fontSize: '0.85rem',
                                    fontFamily: 'monospace',
                                    fontWeight: choice.influenceDelta !== undefined ? 'bold' : 'normal',
                                  }}
                                />
                              </div>
                              <div style={{ flex: 1 }}>
                                <label
                                  style={{
                                    display: 'block',
                                    marginBottom: '0.25rem',
                                    fontSize: '0.8rem',
                                    fontWeight: 500,
                                    color: theme.text.primary,
                                  }}
                                >
                                  Respect
                                </label>
                                <input
                                  type="number"
                                  value={choice.respectDelta ?? ''}
                                  onChange={(e) => {
                                    const value = e.target.value === '' ? undefined : parseInt(e.target.value, 10)
                                    updateChoice(node.id, choiceIndex, {
                                      respectDelta: isNaN(value as number) ? undefined : value,
                                    })
                                  }}
                                  placeholder="+1, -1, 0"
                                  style={{
                                    width: '100%',
                                    padding: '0.5rem',
                                    boxSizing: 'border-box',
                                    backgroundColor: theme.input.background,
                                    border: `1px solid ${theme.input.border}`,
                                    color: choice.respectDelta !== undefined && choice.respectDelta >= 0 ? '#4CAF50' : choice.respectDelta !== undefined ? '#F44336' : theme.input.color,
                                    borderRadius: '4px',
                                    fontSize: '0.85rem',
                                    fontFamily: 'monospace',
                                    fontWeight: choice.respectDelta !== undefined ? 'bold' : 'normal',
                                  }}
                                />
                              </div>
                            </div>

                            {/* Traits requis */}
                            <div>
                              <label
                                style={{
                                  display: 'block',
                                  marginBottom: '0.25rem',
                                  fontSize: '0.8rem',
                                  fontWeight: 500,
                                  color: theme.text.primary,
                                }}
                              >
                                Traits requis
                              </label>
                              <textarea
                                value={
                                  choice.traitRequirements && choice.traitRequirements.length > 0
                                    ? JSON.stringify(choice.traitRequirements, null, 2)
                                    : ''
                                }
                                onChange={(e) => {
                                  const value = e.target.value.trim()
                                  if (!value) {
                                    updateChoice(node.id, choiceIndex, { traitRequirements: undefined })
                                    return
                                  }
                                  try {
                                    const parsed = JSON.parse(value)
                                    if (Array.isArray(parsed)) {
                                      updateChoice(node.id, choiceIndex, { traitRequirements: parsed })
                                    }
                                  } catch {
                                    // Garder la valeur pour permettre la saisie progressive
                                  }
                                }}
                                placeholder='[{"trait": "Autoritaire", "minValue": 5}]'
                                rows={2}
                                style={{
                                  width: '100%',
                                  padding: '0.5rem',
                                  boxSizing: 'border-box',
                                  backgroundColor: theme.input.background,
                                  border: `1px solid ${theme.input.border}`,
                                  color: theme.input.color,
                                  borderRadius: '4px',
                                  fontSize: '0.8rem',
                                  fontFamily: 'monospace',
                                  resize: 'vertical',
                                }}
                              />
                              <div style={{ marginTop: '0.25rem', fontSize: '0.7rem', color: theme.text.secondary, fontStyle: 'italic' }}>
                                Format JSON: {'[{"trait": "NomTrait", "minValue": 5}]'}
                              </div>
                            </div>
                          </div>

                          {/* Target Node */}
                          <div>
                            <label
                              style={{
                                display: 'block',
                                marginBottom: '0.25rem',
                                color: theme.text.primary,
                                fontSize: `${chrome.labelFontRem}rem`,
                              }}
                            >
                              Target Node (ID):
                            </label>
                            <div
                              style={{
                                display: 'flex',
                                gap: '0.35rem',
                                alignItems: 'stretch',
                              }}
                            >
                              <input
                                type="text"
                                value={choice.targetNode}
                                onChange={(e) =>
                                  updateChoice(node.id, choiceIndex, {
                                    targetNode: e.target.value,
                                  })
                                }
                                placeholder="ex: NEXT_NODE, END (termine le dialogue)"
                                list={`node-ids-${node.id}`}
                                style={{
                                  flex: 1,
                                  minWidth: 0,
                                  padding: chrome.inputPadding,
                                  boxSizing: 'border-box',
                                  backgroundColor: theme.input.background,
                                  border: `1px solid ${
                                    choiceErrors.some((e) => e.message.includes('targetNode'))
                                      ? theme.state.error.border
                                      : theme.input.border
                                  }`,
                                  color: theme.input.color,
                                  borderRadius: '6px',
                                  fontFamily: 'monospace',
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => removeChoice(node.id, choiceIndex)}
                                aria-label="Supprimer ce choix"
                                title="Supprimer ce choix"
                                style={{
                                  flexShrink: 0,
                                  alignSelf: 'stretch',
                                  aspectRatio: 1,
                                  minWidth: '2.25rem',
                                  padding: 0,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  border: `1px solid ${theme.border.primary}`,
                                  borderRadius: '6px',
                                  backgroundColor: theme.button.default.background,
                                  color: theme.button.default.color,
                                  cursor: 'pointer',
                                  fontSize: '1rem',
                                  lineHeight: 1,
                                }}
                              >
                                🗑️
                              </button>
                            </div>
                            <datalist id={`node-ids-${node.id}`}>
                              {Array.from(nodeIds).map((id) => (
                                <option key={id} value={id} />
                              ))}
                            </datalist>
                          </div>
                          
                          {choiceErrors.length > 0 && (
                            <div
                              style={{
                                marginTop: '0.5rem',
                                fontSize: '0.85rem',
                                color: theme.state.error.color,
                              }}
                            >
                              {choiceErrors.map((err, i) => (
                                <div key={i}>{err.message}</div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Bouton ajouter choix */}
              {(!node.choices || node.choices.length < 4) && (
                <div style={{ marginBottom: '1rem' }}>
                  <button
                    onClick={() => addChoice(node.id)}
                    style={{
                      padding: '0.5rem 1rem',
                      border: `1px solid ${theme.border.primary}`,
                      borderRadius: '6px',
                      backgroundColor: theme.button.default.background,
                      color: theme.button.default.color,
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                    }}
                  >
                    + Ajouter un choix
                  </button>
                </div>
              )}

              {/* Options avancées (lecture seule) */}
              <div>
                <button
                  onClick={() => toggleAdvanced(node.id)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: `1px solid ${theme.border.primary}`,
                    borderRadius: '6px',
                    backgroundColor: theme.button.default.background,
                    color: theme.button.default.color,
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span>{isAdvancedExpanded ? '▼' : '▶'} Options avancées (lecture seule)</span>
                </button>
                {isAdvancedExpanded && (
                  <div
                    style={{
                      marginTop: '0.5rem',
                      padding: '1rem',
                      backgroundColor: theme.background.secondary,
                      borderRadius: '6px',
                      border: `1px solid ${theme.border.primary}`,
                    }}
                  >
                    <pre
                      style={{
                        margin: 0,
                        fontSize: '0.85rem',
                        color: theme.text.secondary,
                        fontFamily: 'monospace',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {JSON.stringify(
                        {
                          ...node,
                          speaker: node.speaker,
                          line: node.line,
                          choices: node.choices,
                        },
                        null,
                        2
                      )}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )
        })}
        </div>
      </div>
    </div>
  )
}))

