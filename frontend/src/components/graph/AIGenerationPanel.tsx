/**
 * Panel pour générer un nœud de dialogue avec l'IA depuis un nœud parent.
 * Permet de générer une suite ou une branche alternative.
 */
import { useState, useCallback, useEffect } from 'react'
import { useGraphStore } from '../../store/graphStore'
import { useContextStore } from '../../store/contextStore'
import { useToast } from '../shared'
import { useCostGovernance } from '../../hooks/useCostGovernance'
import { ConfirmDialog } from '../shared'
import { theme } from '../../theme'
import { getErrorMessage } from '../../types/errors'
import { DEFAULT_MODEL } from '../../constants'
import * as configAPI from '../../api/config'
import type { LLMModelResponse } from '../../types/api'

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
  const { generateFromNode, isGenerating, nodes } = useGraphStore()
  const { selections } = useContextStore()
  const toast = useToast()
  const { checkBudget } = useCostGovernance()
  
  const [userInstructions, setUserInstructions] = useState('')
  const [showBudgetBlockModal, setShowBudgetBlockModal] = useState(false)
  const [budgetBlockMessage, setBudgetBlockMessage] = useState<string>('')
  const [generationMode, setGenerationMode] = useState<'continuation' | 'branch'>('continuation')
  const [llmModel, setLlmModel] = useState<string>(DEFAULT_MODEL)
  const [maxChoices, setMaxChoices] = useState<number | null>(null)
  const [availableModels, setAvailableModels] = useState<LLMModelResponse[]>([])
  const [narrativeTags, setNarrativeTags] = useState<string[]>([])
  const [targetChoiceIndex, setTargetChoiceIndex] = useState<number | null>(null)
  const [generateAllChoices, setGenerateAllChoices] = useState(false)
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null)
  
  const availableNarrativeTags = ['tension', 'humour', 'dramatique', 'intime', 'révélation']
  
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
  
  // Les sélections sont déjà au bon format (ContextSelection)
  // Pas besoin de conversion, utiliser directement selections
  
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
    
    // Déterminer le speaker NPC (premier personnage sélectionné en full ou excerpt)
    const allCharacters = [
      ...(selections.characters_full || []),
      ...(selections.characters_excerpt || []),
    ]
    const npcSpeakerId = allCharacters.length > 0 ? allCharacters[0] : undefined
    
    // Si les instructions sont vides, on utilisera un texte par défaut côté backend
    const finalInstructions = userInstructions.trim() || "Ecris la réponse du PNJ à ce que dit le PJ"
    
    // Initialiser la progression si génération batch OU TestNode (génère toujours 4 nœuds)
    const isTestNode = parentNodeId?.startsWith('test-node-') ?? false
    if (generateAllChoices || isTestNode) {
      const totalChoices = isTestNode 
        ? 4  // TestNodes génèrent toujours 4 nœuds (critical-failure, failure, success, critical-success)
        : (parentNode?.data?.choices || []).filter((c: { targetNode?: string }) => !c.targetNode || c.targetNode === 'END').length
      setBatchProgress({ current: 0, total: totalChoices })
    }
    
    try {
        const generationResult = await generateFromNode(
          parentNodeId,
          finalInstructions,
          {
            context_selections: selections,
            max_choices: maxChoices,
            npc_speaker_id: npcSpeakerId,
            narrative_tags: narrativeTags.length > 0 ? narrativeTags : undefined,
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
      } else if (targetChoiceIndex !== null) {
        toast(`Nœud généré pour le choix ${targetChoiceIndex + 1}`, 'success', 2000)
      } else {
        toast('Nœud généré avec succès', 'success', 2000)
      }
      
      // Déclencher un événement pour sélectionner et zoomer vers le nouveau nœud
      if (generationResult.nodeId) {
        const event = new CustomEvent('focus-generated-node', {
          detail: { nodeId: generationResult.nodeId }
        })
        window.dispatchEvent(event)
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
    narrativeTags,
    llmModel,
    selections,
    generateFromNode,
    toast,
    onGenerated,
    onClose,
    targetChoiceIndex,
    generateAllChoices,
    parentNode,
    checkBudget,
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
      <div style={{ 
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
              maxHeight: '80px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              "{parentNode.data.line.substring(0, 150)}
              {parentNode.data.line.length > 150 ? '...' : ''}"
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
                      {choice.text || `Choix ${index + 1}`}
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
            const unconnectedChoices = (parentNode.data.choices as Array<{ targetNode?: string; [key: string]: unknown }>).filter(
              (choice) => !choice.targetNode || choice.targetNode === 'END'
            )
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
                {generateAllChoices ? '✓ ' : ''}Générer la suite pour tous les choix ({unconnectedChoices.length})
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
        <select
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
        </select>
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
      
      {/* Tags narratifs */}
      <div>
        <label style={{ 
          display: 'block',
          marginBottom: '0.5rem',
          fontSize: '0.9rem',
          fontWeight: 'bold',
          color: theme.text.primary,
        }}>
          Tags narratifs (optionnel)
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {availableNarrativeTags.map((tag) => (
            <button
              key={tag}
              onClick={() => {
                setNarrativeTags((prev) =>
                  prev.includes(tag)
                    ? prev.filter((t) => t !== tag)
                    : [...prev, tag]
                )
              }}
              style={{
                padding: '0.25rem 0.75rem',
                border: `1px solid ${narrativeTags.includes(tag) ? theme.button.primary.background : theme.input.border}`,
                borderRadius: '4px',
                backgroundColor: narrativeTags.includes(tag) ? theme.button.primary.background : theme.input.background,
                color: narrativeTags.includes(tag) ? theme.button.primary.color : theme.input.color,
                cursor: 'pointer',
                fontSize: '0.8rem',
              }}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>
      
      {/* Info contexte */}
      <div style={{ 
        padding: '0.75rem',
        backgroundColor: theme.background.secondary,
        borderRadius: '6px',
        fontSize: '0.85rem',
        color: theme.text.secondary,
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '0.25rem', color: theme.text.primary }}>
          Contexte sélectionné
        </div>
        <div>
          {(selections.characters_full?.length || 0) + (selections.characters_excerpt?.length || 0) > 0 && (
            <div>Personnages: {(selections.characters_full?.length || 0) + (selections.characters_excerpt?.length || 0)}</div>
          )}
          {(selections.locations_full?.length || 0) + (selections.locations_excerpt?.length || 0) > 0 && (
            <div>Lieux: {(selections.locations_full?.length || 0) + (selections.locations_excerpt?.length || 0)}</div>
          )}
          {(selections.items_full?.length || 0) + (selections.items_excerpt?.length || 0) > 0 && (
            <div>Objets: {(selections.items_full?.length || 0) + (selections.items_excerpt?.length || 0)}</div>
          )}
          {(selections.characters_full?.length || 0) + (selections.characters_excerpt?.length || 0) === 0 && 
           (selections.locations_full?.length || 0) + (selections.locations_excerpt?.length || 0) === 0 && 
           (selections.items_full?.length || 0) + (selections.items_excerpt?.length || 0) === 0 && (
            <div style={{ fontStyle: 'italic' }}>
              Aucun contexte sélectionné. Utilisez le panneau de gauche pour sélectionner des éléments.
            </div>
          )}
        </div>
      </div>
      
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
            : (generateAllChoices ? '✨ Générer pour tous les choix' : targetChoiceIndex !== null ? `✨ Générer pour choix ${targetChoiceIndex + 1}` : '✨ Générer')
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
