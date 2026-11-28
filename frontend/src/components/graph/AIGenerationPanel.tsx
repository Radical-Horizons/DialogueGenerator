/**
 * Panel pour générer un nœud de dialogue avec l'IA depuis un nœud parent.
 * Permet de générer une suite ou une branche alternative.
 */
import { useState, useCallback, useEffect, useMemo } from 'react'
import { useGraphStore } from '../../store/graphStore'
import { useGraphViewStore } from '../../store/graphViewStore'
import { useToast } from '../shared'
import { useCostGovernance } from '../../hooks/useCostGovernance'
import { ConfirmDialog } from '../shared'
import { CostEstimationBadge } from './CostEstimationBadge'
import { theme } from '../../theme'
import { getErrorMessage } from '../../types/errors'
import { StyledSelect } from '../shared/StyledSelect'
import { DEFAULT_MODEL } from '../../constants'
import * as configAPI from '../../api/config'
import type { LLMModelResponse } from '../../types/api'
import {
  choiceHasOpenSlot,
  countExpandedBatchNodesForChoices,
  getChoiceDisplayLabel,
  type SlotChoice,
} from '../../utils/graphChoiceLabels'
import { serializeDialogueNodesForApi } from '../../utils/dialoguePathContext'
import { composeSceneInstructions } from '../../utils/sceneSheet'
import { useSceneGeneration, useSceneSheet } from '../../hooks/useSceneSheet'
import { SceneToneChips } from '../scene/SceneToneChips'
import { useSceneReadOnly } from '../../hooks/useSceneReadOnly'
import { DialogueLineText } from '../shared/DialogueLineText'

interface AIGenerationPanelProps {
  parentNodeId: string | null
  onClose: () => void
  onGenerated?: () => void
}

export function AIGenerationPanel({
  parentNodeId,
  onClose,
  onGenerated,
}: AIGenerationPanelProps) {
  const { generateFromNode, isGenerating, nodes, edges } = useGraphStore()
  const sceneGeneration = useSceneGeneration(parentNodeId)
  const { sheet } = useSceneSheet()
  const sceneReadOnly = useSceneReadOnly()
  const toast = useToast()
  const { checkBudget } = useCostGovernance()
  
  const [userInstructions, setUserInstructions] = useState('')
  const [showBudgetBlockModal, setShowBudgetBlockModal] = useState(false)
  const [budgetBlockMessage, setBudgetBlockMessage] = useState<string>('')
  const [generationMode, setGenerationMode] = useState<'continuation' | 'branch'>('continuation')
  const [llmModel, setLlmModel] = useState<string>(DEFAULT_MODEL)
  const [maxChoices, setMaxChoices] = useState<number | null>(null)
  const [availableModels, setAvailableModels] = useState<LLMModelResponse[]>([])
  const [targetChoiceIndex, setTargetChoiceIndex] = useState<number | null>(null)
  const [generateAllChoices, setGenerateAllChoices] = useState(false)
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null)
  const [budgetExceededByEstimate, setBudgetExceededByEstimate] = useState(false)
  
  // Charger les modèles disponibles
  useEffect(() => {
    configAPI.listLLMModels()
      .then((response) => {
        setAvailableModels(response.models)
      })
      .catch((err) => {
        console.error('Erreur lors du chargement des modèles:', err)
      })
  }, [])

  // Trouver le nœud parent
  const parentNode = parentNodeId ? nodes.find((n) => n.id === parentNodeId) : null

  const batchAllNodesCount = useMemo(() => {
    return countExpandedBatchNodesForChoices(parentNode?.data?.choices as SlotChoice[] | undefined)
  }, [parentNode])

  // Handler pour générer le nœud
  const handleGenerate = useCallback(async () => {
    if (!parentNodeId) {
      toast('Aucun nœud parent sélectionné', 'warning')
      return
    }
    
    // En mode "suite (nextNode)", si le parent a des choix, il faut en sélectionner au moins un
    const parentChoices = parentNode?.data?.choices || []
    const hasChoices = parentChoices.length > 0
    if (hasChoices && generationMode === 'continuation') {
      toast('Ce nœud a des choix. Passez en mode "Branche alternative" pour sélectionner un choix.', 'warning')
      return
    }
    
    if (hasChoices && generationMode === 'branch') {
      // En mode branche avec choix disponibles, il faut sélectionner au moins un choix
      if (targetChoiceIndex === null && !generateAllChoices) {
        toast('Veuillez sélectionner au moins un choix pour générer la suite', 'warning')
        return
      }
    }
    
    // Vérifier le budget avant génération (Task 7)
    const budgetCheck = await checkBudget()
    if (!budgetCheck.allowed) {
      setBudgetBlockMessage(budgetCheck.message || 'Budget dépassé')
      setShowBudgetBlockModal(true)
      return
    }
    
    // Si les instructions sont vides, on utilisera un texte par défaut côté backend
    const finalInstructions = userInstructions.trim() || "Ecris la réponse du PNJ à ce que dit le PJ"
    
    // Initialiser la progression si génération batch OU TestNode (génère toujours 4 nœuds)
    const isTestNode = parentNodeId?.startsWith('test-node-') ?? false
    if (generateAllChoices || isTestNode) {
      const totalNodes = isTestNode
        ? 4
        : countExpandedBatchNodesForChoices(parentNode?.data?.choices as SlotChoice[] | undefined)
      setBatchProgress({ current: 0, total: Math.max(1, totalNodes) })
    }
    
    try {
        const generationResult = await generateFromNode(
          parentNodeId,
          finalInstructions,
          {
            max_choices: maxChoices,
            llm_model_identifier: llmModel,
            target_choice_index: targetChoiceIndex ?? null,
            generate_all_choices: generateAllChoices,
            onBatchProgress: (current: number, total: number) => {
              setBatchProgress({ current, total })
            },
          }
        )
      
        // Message de succès adapté selon le mode de génération
        if (generateAllChoices || isTestNode) {
          const batchInfo = generationResult.batchInfo
          const connectedCount = batchInfo?.connectedChoices ?? 0
          const generatedCount = batchInfo?.generatedChoices ?? 0
          const failedCount = batchInfo?.failedChoices ?? 0
        const totalChoices = batchInfo?.totalChoices ?? 0
        const failedSuffix = failedCount > 0 ? ` (${failedCount} échec(s))` : ''
        const totalSuffix = totalChoices > 0 ? ` / ${totalChoices} choix` : ''
        toast(
          `${connectedCount} choix(s) déjà connecté(s), ${generatedCount} nouveau(x) nœud(s) généré(s)${failedSuffix}${totalSuffix}`,
          'success',
          4000
        )
      } else if (targetChoiceIndex !== null && parentNode) {
        const lbl = getChoiceDisplayLabel(
          parentNodeId!,
          (parentNode.data.choices as Array<{ text?: string; test?: unknown; choiceId?: string }>)[
            targetChoiceIndex
          ] ?? {},
          targetChoiceIndex,
          nodes,
          edges
        )
        toast(`Nœud généré pour : ${lbl}`, 'success', 2000)
      } else {
        toast('Nœud généré avec succès', 'success', 2000)
      }
      
      // Déclencher un événement pour sélectionner et zoomer vers le nouveau nœud
      if (generationResult.nodeId) {
        useGraphViewStore.getState().focusNode(generationResult.nodeId)
      }
      
      onGenerated?.()
      onClose()
    } catch (err) {
      toast(`Erreur lors de la génération: ${getErrorMessage(err)}`, 'error')
    } finally {
      setBatchProgress(null)
    }
  }, [
    parentNodeId,
    userInstructions,
    generationMode,
    maxChoices,
    llmModel,
    generateFromNode,
    toast,
    onGenerated,
    onClose,
    targetChoiceIndex,
    generateAllChoices,
    parentNode,
    checkBudget,
    nodes,
    edges,
  ])

  // Fermer la modale quand la génération se termine (doit être avant tout return conditionnel)
  useEffect(() => {
    if (!isGenerating && batchProgress) {
      const timer = setTimeout(() => {
        setBatchProgress(null)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [isGenerating, batchProgress])

  // Payload pour l'estimation de coût (aligné sur GenerateNodeRequest).
  // useMemo évite de recréer l'objet à chaque render (référence stable pour useEffect dans le badge).
  // Doit être avant tout return conditionnel (règles des hooks React).
  const estimateRequest = useMemo(
    () => {
      if (!parentNodeId || !parentNode) return null
      return {
        parent_node_id: parentNodeId,
        parent_node_content: (parentNode.data ?? {}) as Record<string, unknown>,
        user_instructions: composeSceneInstructions(
          sceneGeneration.brief,
          userInstructions.trim() || 'Ecris la réponse du PNJ à ce que dit le PJ',
        ),
        context_selections: sceneGeneration.contextSelections as unknown as Record<string, unknown>,
        max_choices: maxChoices ?? undefined,
        llm_model_identifier: llmModel,
        target_choice_index: targetChoiceIndex ?? undefined,
        generate_all_choices: generateAllChoices,
        dialogue_nodes: serializeDialogueNodesForApi(nodes),
        npc_speaker_id: sceneGeneration.npcSpeakerId,
        player_character_id: sceneGeneration.playerCharacterId,
        narrative_tags: sceneGeneration.narrativeTags,
        author_profile: sceneGeneration.authorProfile,
      }
    },
    [parentNodeId, parentNode, userInstructions, sceneGeneration, maxChoices, llmModel, targetChoiceIndex, generateAllChoices, nodes]
  )

  if (!parentNodeId || !parentNode) {
    return (
      <div style={{ padding: '1rem', color: theme.text.secondary }}>
        Aucun nœud parent sélectionné
      </div>
    )
  }
  
  // Fonction helper pour vérifier si le bouton doit être désactivé
  const isGenerateDisabled = () => {
    if (isGenerating) return true
    if (budgetExceededByEstimate) return true
    // En mode "suite (nextNode)", si le parent a des choix, il faut en sélectionner au moins un
    const parentChoices = parentNode?.data?.choices || []
    const hasChoices = parentChoices.length > 0
    if (hasChoices && generationMode === 'continuation') {
      return true
    }
    if (hasChoices && generationMode === 'branch') {
      return targetChoiceIndex === null && !generateAllChoices
    }
    return false
  }
  
  // Détecter si c'est un TestNode (pour afficher la modal même si generateAllChoices est false)
  const isTestNode = parentNodeId?.startsWith('test-node-') ?? false
  const shouldShowProgressModal = isGenerating && (generateAllChoices || isTestNode) && batchProgress
  
  return (
    <>
      {/* Modal de progression pour génération batch OU TestNode */}
      {shouldShowProgressModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: theme.background.panel,
              borderRadius: '8px',
              width: '90%',
              maxWidth: '500px',
              padding: '2rem',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem',
            }}
          >
            <div style={{ fontSize: '1.2rem', fontWeight: 600, color: theme.text.primary }}>
              Génération en cours (parallèle)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ fontSize: '0.9rem', color: theme.text.secondary }}>
                Génération de {batchProgress.total} nœud(s) en parallèle...
              </div>
              <div
                style={{
                  width: '100%',
                  height: '8px',
                  backgroundColor: theme.border.primary,
                  borderRadius: '4px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${(batchProgress.current / batchProgress.total) * 100}%`,
                    height: '100%',
                    backgroundColor: theme.button.primary.background,
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
              <div style={{ fontSize: '0.85rem', color: theme.text.secondary, textAlign: 'center' }}>
                {batchProgress.current} / {batchProgress.total} nœud(s) généré(s)
              </div>
            </div>
          </div>
        </div>
      )}
      <div
      data-testid="ai-generation-panel"
      style={{
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minHeight: 0,
      padding: '1rem',
      gap: '1rem',
      overflowY: 'auto',
    }}>
      {/* En-tête avec aperçu du nœud parent */}
      <div>
        <h3 style={{ 
          margin: 0, 
          marginBottom: '0.75rem',
          color: theme.text.primary,
          fontSize: '1.1rem',
          fontWeight: 600,
        }}>
          Générer la suite avec l'IA
        </h3>
        <div style={{
          padding: '0.75rem',
          backgroundColor: theme.background.secondary,
          borderRadius: '6px',
          border: `1px solid ${theme.border.primary}`,
          marginBottom: '0.5rem',
        }}>
          <div style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            color: theme.text.secondary,
            marginBottom: '0.5rem',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            Contexte parent
          </div>
          {parentNode.data?.speaker && (
            <div style={{
              fontSize: '0.9rem',
              color: theme.text.primary,
              marginBottom: '0.25rem',
            }}>
              <span style={{ fontWeight: 600 }}>Speaker:</span> <span style={{ color: theme.button.primary.background }}>{parentNode.data.speaker}</span>
            </div>
          )}
          {parentNode.data?.line && (
            <div style={{ 
              marginTop: '0.5rem',
              fontSize: '0.85rem',
              color: theme.text.secondary,
              fontStyle: 'italic',
              lineHeight: 1.5,
              padding: '0.5rem',
              backgroundColor: theme.background.panel,
              borderRadius: '4px',
              whiteSpace: 'pre-wrap',
            }}
            data-testid="ai-generation-parent-line">
              <DialogueLineText text={parentNode.data.line} />
            </div>
          )}
        </div>
      </div>
      
      {/* Instructions utilisateur */}
      <div>
        <label style={{ 
          display: 'block',
          marginBottom: '0.5rem',
          fontSize: '0.9rem',
          fontWeight: 'bold',
          color: theme.text.primary,
        }}>
          Instructions pour la génération
        </label>
        <textarea
          value={userInstructions}
          onChange={(e) => setUserInstructions(e.target.value)}
          placeholder="Décrivez ce que vous voulez générer..."
          style={{
            width: '100%',
            minHeight: '100px',
            padding: '0.75rem',
            border: `1px solid ${theme.input.border}`,
            borderRadius: '6px',
            backgroundColor: theme.input.background,
            color: theme.input.color,
            fontSize: '0.9rem',
            fontFamily: 'inherit',
            resize: 'vertical',
          }}
        />
      </div>
      
      {/* Mode de génération */}
      <div>
        <label style={{ 
          display: 'block',
          marginBottom: '0.5rem',
          fontSize: '0.9rem',
          fontWeight: 'bold',
          color: theme.text.primary,
        }}>
          Mode
        </label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => {
              setGenerationMode('continuation')
              setTargetChoiceIndex(null)
              setGenerateAllChoices(false)
            }}
            style={{
              flex: 1,
              padding: '0.5rem',
              border: `1px solid ${generationMode === 'continuation' ? theme.button.primary.background : theme.input.border}`,
              borderRadius: '6px',
              backgroundColor: generationMode === 'continuation' ? theme.button.primary.background : theme.input.background,
              color: generationMode === 'continuation' ? theme.button.primary.color : theme.input.color,
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            Suite (nextNode)
          </button>
          <button
            onClick={() => setGenerationMode('branch')}
            style={{
              flex: 1,
              padding: '0.5rem',
              border: `1px solid ${generationMode === 'branch' ? theme.button.primary.background : theme.input.border}`,
              borderRadius: '6px',
              backgroundColor: generationMode === 'branch' ? theme.button.primary.background : theme.input.background,
              color: generationMode === 'branch' ? theme.button.primary.color : theme.input.color,
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            Branche alternative (choice)
          </button>
        </div>
      </div>
      
      {/* Sélection de choix (si parent a des choix) */}
      {parentNode.data?.choices && parentNode.data.choices.length > 0 && (
        <div>
          <label style={{ 
            display: 'block',
            marginBottom: '0.5rem',
            fontSize: '0.9rem',
            fontWeight: 'bold',
            color: theme.text.primary,
          }}>
            Génération pour choix spécifique
          </label>
          <div style={{
            padding: '0.75rem',
            backgroundColor: theme.background.secondary,
            borderRadius: '6px',
            border: `1px solid ${theme.border.primary}`,
            marginBottom: '0.5rem',
          }}>
            <div style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: theme.text.secondary,
              marginBottom: '0.5rem',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              Choix disponibles
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {(parentNode.data.choices as Array<{ text: string; targetNode?: string; [key: string]: unknown }>).map((choice, index: number) => {
                const isConnected = choice.targetNode && choice.targetNode !== 'END'
                return (
                  <div
                    key={index}
                    data-testid={!isConnected ? `ai-gen-choice-${index}` : undefined}
                    style={{
                      padding: '0.5rem',
                      backgroundColor: theme.background.panel,
                      borderRadius: '4px',
                      border: `1px solid ${targetChoiceIndex === index ? theme.button.primary.background : theme.border.primary}`,
                      cursor: isConnected ? 'not-allowed' : 'pointer',
                      opacity: isConnected ? 0.6 : 1,
                    }}
                    onClick={() => {
                      if (!isConnected) {
                        setTargetChoiceIndex(targetChoiceIndex === index ? null : index)
                        setGenerateAllChoices(false)
                        setGenerationMode('branch')
                      }
                    }}
                  >
                    <div style={{ 
                      fontSize: '0.85rem',
                      color: theme.text.primary,
                      fontWeight: targetChoiceIndex === index ? 600 : 400,
                    }}>
                      {getChoiceDisplayLabel(parentNodeId!, choice, index, nodes, edges)}
                      {isConnected && (
                        <span style={{ 
                          fontSize: '0.75rem',
                          color: theme.text.secondary,
                          marginLeft: '0.5rem',
                        }}>
                          (déjà connecté)
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          
          {/* Bouton "Générer pour tous les choix" */}
          {(() => {
            const unconnectedChoices = (parentNode.data.choices as SlotChoice[]).filter(choiceHasOpenSlot)
            const batchNodeTotal = countExpandedBatchNodesForChoices(unconnectedChoices)
            return unconnectedChoices.length > 1 ? (
              <button
                onClick={() => {
                  setGenerateAllChoices(!generateAllChoices)
                  setTargetChoiceIndex(null)
                  setGenerationMode('branch')
                }}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: `1px solid ${generateAllChoices ? theme.button.primary.background : theme.input.border}`,
                  borderRadius: '6px',
                  backgroundColor: generateAllChoices ? theme.button.primary.background : theme.input.background,
                  color: generateAllChoices ? theme.button.primary.color : theme.input.color,
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  marginBottom: '0.5rem',
                }}
              >
                {generateAllChoices ? '✓ ' : ''}Générer la suite pour tous les choix (
                {unconnectedChoices.length} choix → {batchNodeTotal} nœud
                {batchNodeTotal > 1 ? 's' : ''})
              </button>
            ) : null
          })()}
        </div>
      )}
      
      {/* Options LLM */}
      <div>
        <label style={{ 
          display: 'block',
          marginBottom: '0.5rem',
          fontSize: '0.9rem',
          fontWeight: 'bold',
          color: theme.text.primary,
        }}>
          Modèle LLM
        </label>
        <StyledSelect
          data-testid="llm-model-select"
          value={llmModel}
          onChange={(e) => setLlmModel(e.target.value)}
          style={{
            width: '100%',
            padding: '0.5rem',
            border: `1px solid ${theme.input.border}`,
            borderRadius: '6px',
            backgroundColor: theme.input.background,
            color: theme.input.color,
            fontSize: '0.9rem',
          }}
        >
          {availableModels.map((model, index) => (
            <option key={`${model.model_identifier}-${index}-${model.display_name || ''}`} value={model.model_identifier}>
              {model.display_name || model.model_identifier}
            </option>
          ))}
        </StyledSelect>
      </div>
      
      {/* Max choices */}
      <div>
        <label style={{ 
          display: 'block',
          marginBottom: '0.5rem',
          fontSize: '0.9rem',
          fontWeight: 'bold',
          color: theme.text.primary,
        }}>
          Nombre maximum de choix (optionnel)
        </label>
        <input
          type="number"
          min="1"
          max="10"
          value={maxChoices || ''}
          onChange={(e) => setMaxChoices(e.target.value ? parseInt(e.target.value, 10) : null)}
          placeholder="Laisser vide pour illimité"
          style={{
            width: '100%',
            padding: '0.5rem',
            border: `1px solid ${theme.input.border}`,
            borderRadius: '6px',
            backgroundColor: theme.input.background,
            color: theme.input.color,
            fontSize: '0.9rem',
          }}
        />
      </div>
      
      {/* Tons : ceux de la fiche de scène, cochés ici comme là-haut. */}
      <div>
        <span style={{
          display: 'block',
          marginBottom: '0.5rem',
          fontSize: '0.9rem',
          fontWeight: 'bold',
          color: theme.text.primary,
        }}>
          Ton de la scène
        </span>
        <SceneToneChips sheet={sheet} readOnly={sceneReadOnly} />
      </div>

      {/* Info contexte : lue dans la fiche de scène */}
      <div style={{
        padding: '0.75rem',
        backgroundColor: theme.background.secondary,
        borderRadius: '6px',
        fontSize: '0.85rem',
        color: theme.text.secondary,
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '0.25rem', color: theme.text.primary }}>
          Contexte de la scène
        </div>
        <div data-testid="ai-generation-scene-dramatis" style={{ color: theme.text.primary, marginBottom: '0.25rem' }}>
          Scène : {sceneGeneration.npcSpeakerId ?? 'à préciser'} (PNJ) · {sceneGeneration.playerCharacterId} (PJ)
        </div>
        {sceneGeneration.contextSelections.scene_location ? (
          <div>Lieu : {String(sceneGeneration.contextSelections.scene_location.lieu)}</div>
        ) : null}
        {sceneGeneration.brief ? <div>Brief envoyé avec la consigne.</div> : null}
        <div style={{ fontStyle: 'italic' }}>
          La fiche de scène, en tête du graphe, fixe les personnages, le lieu, le brief, les fiches liées, les tons et le profil d’auteur ; le serveur peut joindre un figurant.
        </div>
      </div>

      {/* Estimation coût (Story 1.11) */}
      <CostEstimationBadge
        estimateRequest={estimateRequest}
        onBudgetExceeded={setBudgetExceededByEstimate}
      />

      {/* Actions */}
      <div style={{ 
        display: 'flex', 
        gap: '0.5rem',
        marginTop: 'auto',
        paddingTop: '1rem',
        borderTop: `1px solid ${theme.border.primary}`,
      }}>
        <button
          onClick={onClose}
          disabled={isGenerating}
          style={{
            flex: 1,
            padding: '0.75rem',
            border: `1px solid ${theme.border.primary}`,
            borderRadius: '6px',
            backgroundColor: theme.button.default.background,
            color: theme.button.default.color,
            cursor: isGenerating ? 'not-allowed' : 'pointer',
            opacity: isGenerating ? 0.6 : 1,
            fontSize: '0.9rem',
          }}
        >
          Annuler
        </button>
        <button
          data-testid="ai-generation-submit"
          onClick={handleGenerate}
          disabled={isGenerateDisabled()}
          style={{
            flex: 1,
            padding: '0.75rem',
            border: 'none',
            borderRadius: '6px',
            backgroundColor: theme.button.primary.background,
            color: theme.button.primary.color,
            cursor: isGenerateDisabled() ? 'not-allowed' : 'pointer',
            opacity: isGenerateDisabled() ? 0.6 : 1,
            fontWeight: 700,
            fontSize: '0.9rem',
          }}
        >
          {isGenerating 
            ? (generateAllChoices
              ? batchProgress?.total
                ? `Génération ${batchProgress.current}/${batchProgress.total}...`
                : 'Génération batch...'
              : 'Génération...')
            : generateAllChoices
              ? `Générer pour tous les choix (${batchAllNodesCount} nœud${batchAllNodesCount > 1 ? 's' : ''})`
              : targetChoiceIndex !== null
                ? `Générer : ${getChoiceDisplayLabel(parentNodeId!, (parentNode!.data.choices as Array<{ text?: string; test?: unknown; choiceId?: string }>)[targetChoiceIndex] ?? {}, targetChoiceIndex, nodes, edges)}`
                : 'Générer'
          }
        </button>
      </div>
      
      {/* Modal de blocage budget (Task 7) */}
      <ConfirmDialog
        isOpen={showBudgetBlockModal}
        title="Budget dépassé"
        message={budgetBlockMessage || "Votre quota mensuel a été atteint. Veuillez augmenter le budget ou attendre le prochain mois."}
        confirmLabel="Fermer"
        cancelLabel="Fermer"
        variant="danger"
        onConfirm={() => setShowBudgetBlockModal(false)}
        onCancel={() => setShowBudgetBlockModal(false)}
      />
    </div>
    </>
  )
}
