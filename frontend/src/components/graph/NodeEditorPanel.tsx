/**
 * Panel pour éditer les propriétés d'un nœud sélectionné.
 * Version avec React Hook Form + Zod pour validation.
 *
 * Story 16.4 Task 3 (AC 4) : Lecture depuis la projection (nodes), écriture via updateNode
 * qui en mode document SoT met à jour le document puis recalcule la projection. Les identités
 * stables (node.id, choiceId) évitent un reset du panel après édition. Debounce/throttle inchangés.
 */
import { memo, useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useForm, FormProvider, useFormContext, useFieldArray, type FieldErrors } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useShallow } from 'zustand/react/shallow'
import { useGraphStore } from '../../store/graphStore'
import { useContextStore } from '../../store/contextStore'
import { useToast } from '../shared'
import { theme } from '../../theme'
import { getErrorMessage } from '../../types/errors'
import { DEFAULT_MODEL } from '../../constants'
import * as configAPI from '../../api/config'
import type { LLMModelResponse } from '../../types/api'
import {
  dialogueNodeDataSchema,
  testNodeDataSchema,
  endNodeDataSchema,
  type DialogueNodeData,
  type TestNodeData,
  type EndNodeData,
  type Choice,
} from '../../schemas/nodeEditorSchema'
import { stableChoiceEdgeId } from '../../utils/graphEdgeBuilders'
import { getParentChoiceForTestNode } from '../../utils/testNodeSync'
import { ChoiceEditor } from './ChoiceEditor'
import { useEstimation } from '../../hooks/useEstimation'
import { EstimationBadge } from '../estimation'

export const NodeEditorPanel = memo(function NodeEditorPanel() {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId)
  const selectedNode = useGraphStore(
    useShallow((s) => s.nodes.find((n) => n.id === s.selectedNodeId) ?? null)
  )
  const {
    updateNode,
    generateFromNode,
    isGenerating,
    setSelectedNode,
    setShowDeleteNodeConfirm,
    createEmptyNode,
    addNode,
    connectNodes,
    disconnectNodes,
    duplicateNode,
    nodes,
  } = useGraphStore()
  const { selections } = useContextStore()
  const toast = useToast()
  
  const [showGenerationOptions, setShowGenerationOptions] = useState(false)
  const [userInstructions, setUserInstructions] = useState('')
  const [llmModel, setLlmModel] = useState<string>(DEFAULT_MODEL)
  const [availableModels, setAvailableModels] = useState<LLMModelResponse[]>([])
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null)
  
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
  
  const nodeType = selectedNode?.type || 'dialogueNode'
  
  // Déterminer le schéma selon le type de nœud
  const schema = nodeType === 'dialogueNode'
    ? dialogueNodeDataSchema
    : nodeType === 'testNode'
    ? testNodeDataSchema
    : endNodeDataSchema
  
  const form = useForm<DialogueNodeData | TestNodeData | EndNodeData>({
    resolver: zodResolver(schema),
    defaultValues: nodeType === 'dialogueNode'
      ? {
          id: selectedNode?.id || '',
          speaker: selectedNode?.data?.speaker || '',
          line: selectedNode?.data?.line || '',
          choices: (selectedNode?.data?.choices || []) as Choice[],
          nextNode: selectedNode?.data?.nextNode || '',
        }
      : nodeType === 'testNode'
      ? {
          id: selectedNode?.id || '',
          test: selectedNode?.data?.test || '',
          line: selectedNode?.data?.line || '',
          criticalFailureNode: selectedNode?.data?.criticalFailureNode || '',
          failureNode: selectedNode?.data?.failureNode || '',
          successNode: selectedNode?.data?.successNode || '',
          criticalSuccessNode: selectedNode?.data?.criticalSuccessNode || '',
        }
      : {
          id: selectedNode?.id || '',
        },
    mode: 'onChange',
  })
  
  const { register, handleSubmit, formState: { errors }, reset, watch } = form
  const isFlushingRef = useRef(false)
  const previousSelectedNodeIdRef = useRef<string | null>(null)
  const debouncePushRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const DEBOUNCE_MS = 100

  /** Merge form values into node data for store push (ADR-006). Preserves connection fields (targetNode, test*Node) for choices. */
  const mergeFormDataIntoNodeData = useCallback(
    (
      nType: string,
      nodeData: Record<string, unknown>,
      formValues: DialogueNodeData | TestNodeData | EndNodeData
    ): Record<string, unknown> => {
      if (nType === 'dialogueNode') {
        const storeChoices = (nodeData.choices || []) as Choice[]
        const formChoices = (formValues as DialogueNodeData).choices || []
        const mergedChoices: Choice[] = formChoices.map((fc, i) => {
          const storeChoice = storeChoices[i]
          return {
            ...fc,
            // targetNode, test*Nodes sont des connexions gérées par les edges — jamais par le form.
            // Utiliser uniquement la valeur du store pour éviter la boucle idle form→store→form.
            targetNode: storeChoice?.targetNode,
            testCriticalFailureNode: storeChoice?.testCriticalFailureNode ?? fc.testCriticalFailureNode,
            testFailureNode: storeChoice?.testFailureNode ?? fc.testFailureNode,
            testSuccessNode: storeChoice?.testSuccessNode ?? fc.testSuccessNode,
            testCriticalSuccessNode: storeChoice?.testCriticalSuccessNode ?? fc.testCriticalSuccessNode,
          }
        })
        return { ...nodeData, ...formValues, choices: mergedChoices }
      }
      if (nType === 'testNode') {
        return { ...nodeData, ...formValues }
      }
      return { ...nodeData, ...formValues }
    },
    []
  )

  // ADR-006 : pousser le formulaire vers le store à la saisie (debounce ≤ 100 ms), pas de brouillon.
  // getState() dans le callback : lecture de l'état au moment de l'exécution (après 100 ms), pas dans le render.
  const watchedValues = watch()
  useEffect(() => {
    if (!selectedNodeId) return
    if (debouncePushRef.current) clearTimeout(debouncePushRef.current)
    debouncePushRef.current = setTimeout(() => {
      debouncePushRef.current = null
      const state = useGraphStore.getState()
      if (state.selectedNodeId !== selectedNodeId) return
      const node = state.nodes.find((n) => n.id === selectedNodeId)
      if (!node?.data) return
      const formValues = form.getValues()
      const merged = mergeFormDataIntoNodeData(nodeType, node.data as Record<string, unknown>, formValues)
      // Evite une boucle idle: ne pousse pas au store si le formulaire n'a rien changé.
      const mergedStr = JSON.stringify(merged)
      const currentStr = JSON.stringify(node.data)
      if (mergedStr === currentStr) return
      updateNode(selectedNodeId, { data: merged })
    }, DEBOUNCE_MS)
    return () => {
      if (debouncePushRef.current) {
        clearTimeout(debouncePushRef.current)
        debouncePushRef.current = null
      }
    }
  }, [watchedValues, selectedNodeId, nodeType, form, updateNode, mergeFormDataIntoNodeData])

  // Synchroniser avec le nœud sélectionné ; au changement de nœud, flusher le formulaire vers l’ancien nœud (ADR-006 : filet de sécurité)
  useEffect(() => {
    const prevId = previousSelectedNodeIdRef.current
    const currentId = selectedNodeId ?? null
    const selectionChanged = prevId !== currentId

    if (selectionChanged && prevId != null) {
      const values = form.getValues()
      const state = useGraphStore.getState()
      const prevNode = state.nodes.find((n) => n.id === prevId)
      if (prevNode?.data) {
        const prevNodeType = prevNode.type ?? 'dialogueNode'
        const merged = mergeFormDataIntoNodeData(
          prevNodeType,
          prevNode.data as Record<string, unknown>,
          values
        )
        updateNode(prevId, { data: merged })
      }
      if (debouncePushRef.current) {
        clearTimeout(debouncePushRef.current)
        debouncePushRef.current = null
      }
    }
    previousSelectedNodeIdRef.current = currentId

    if (selectionChanged && selectedNode?.data) {
      if (nodeType === 'dialogueNode') {
        const choices = (selectedNode.data.choices || []) as Choice[]
        
        reset({
          id: selectedNode.id,
          speaker: selectedNode.data.speaker || '',
          line: selectedNode.data.line || '',
          choices,
          nextNode: selectedNode.data.nextNode || '',
        })
      } else if (nodeType === 'testNode') {
        reset({
          id: selectedNode.id,
          test: selectedNode.data.test || '',
          line: selectedNode.data.line || '',
          criticalFailureNode: selectedNode.data.criticalFailureNode || '',
          failureNode: selectedNode.data.failureNode || '',
          successNode: selectedNode.data.successNode || '',
          criticalSuccessNode: selectedNode.data.criticalSuccessNode || '',
        })
      } else {
        reset({
          id: selectedNode.id,
        })
      }
    }
  }, [selectedNodeId, selectedNode, nodeType, reset, form, updateNode])

  const onSubmit = useCallback((data: DialogueNodeData | TestNodeData | EndNodeData) => {
    if (!selectedNodeId) return
    if (nodeType === 'dialogueNode') {
      const line = (data as DialogueNodeData).line ?? ''
      if (typeof line === 'string' && line.trim() === '') {
        toast('Nœud vide - ajouter du texte', 'warning')
      }
    }
    updateNode(selectedNodeId, {
      data: {
        ...selectedNode?.data,
        ...data,
      },
    })
    if (!isFlushingRef.current) {
      window.dispatchEvent(new CustomEvent('request-save-dialogue'))
    }
  }, [selectedNodeId, nodeType, selectedNode?.data, updateNode, toast])

  // Flush du formulaire vers le store quand le graphe demande une sauvegarde (évite perte des edits non soumis)
  useEffect(() => {
    const onFlush = () => {
      isFlushingRef.current = true
      form.handleSubmit(onSubmit)()
        .then(() => { window.dispatchEvent(new CustomEvent('node-editor-flushed')) })
        .catch(() => { window.dispatchEvent(new CustomEvent('node-editor-flushed')) })
        .finally(() => { isFlushingRef.current = false })
    }
    window.addEventListener('flush-node-editor-form', onFlush)
    return () => window.removeEventListener('flush-node-editor-form', onFlush)
  }, [form, onSubmit])
  
  const handleDelete = () => {
    if (!selectedNodeId) return
    setShowDeleteNodeConfirm(true)
  }

  const handleDuplicate = () => {
    if (!selectedNodeId) return
    duplicateNode(selectedNodeId)
  }
  
  // Handler pour générer la suite (nextNode)
  const handleGenerateNext = useCallback(async () => {
    if (!selectedNodeId) {
      toast('Aucun nœud sélectionné', 'warning')
      return
    }
    
    // Vérifier si le nœud a des choix : en mode nextNode, il faut sélectionner au moins un choix
    const nodeChoices = selectedNode?.data?.choices || []
    if (nodeChoices.length > 0) {
      // Si le nœud a des choix, il faut utiliser le panneau AIGenerationPanel pour sélectionner un choix
      toast('Ce nœud a des choix. Utilisez le bouton "Générer la suite avec l\'IA" pour sélectionner un choix spécifique.', 'warning')
      return
    }
    
    try {
      const allCharacters = [
        ...(selections.characters_full || []),
        ...(selections.characters_excerpt || []),
      ]
      const npcSpeakerId = allCharacters.length > 0 ? allCharacters[0] : undefined
      
      // Si les instructions sont vides, on utilisera un texte par défaut côté backend
      const finalInstructions = userInstructions.trim() || "Ecris la réponse du PNJ à ce que dit le PJ"
      
      const generationResult = await generateFromNode(
        selectedNodeId,
        finalInstructions,
        {
          context_selections: selections,
          npc_speaker_id: npcSpeakerId,
          llm_model_identifier: llmModel,
        }
      )
      
      toast('Nœud généré avec succès', 'success', 2000)
      
      // Focus automatique vers le nouveau nœud
      if (generationResult.nodeId) {
        setSelectedNode(generationResult.nodeId)
        const event = new CustomEvent('focus-generated-node', {
          detail: { nodeId: generationResult.nodeId }
        })
        window.dispatchEvent(event)
      }
      
      setShowGenerationOptions(false)
      setUserInstructions('')
    } catch (err) {
      toast(`Erreur lors de la génération: ${getErrorMessage(err)}`, 'error')
    }
  }, [selectedNodeId, selectedNode?.data?.choices, userInstructions, selections, llmModel, generateFromNode, setSelectedNode, toast])

  /** Créer un nœud vide et le lier comme cible du choix (panneau Détails, par choix). */
  const handleCreateEmptyNodeForChoice = useCallback((choiceIndex: number) => {
    if (!selectedNodeId || !selectedNode) return
    const storeChoices = (selectedNode.data?.choices || []) as Choice[]
    const formData = form.getValues() as DialogueNodeData
    const formChoices = formData.choices || []
    // Synchroniser la structure des choix (longueur / champs éditables) depuis le formulaire,
    // tout en conservant les champs de connexion du store pour chaque choix (targetNode, test*Node)
    // pour ne pas déconnecter les autres choix (ex. choix #1) ni perdre la persistance.
    if (nodeType === 'dialogueNode' && formChoices.length >= storeChoices.length) {
      const mergedChoices: Choice[] = formChoices.map((fc, i) => {
        const storeChoice = storeChoices[i]
        return {
          ...fc,
          targetNode: storeChoice?.targetNode,
          testCriticalFailureNode: storeChoice?.testCriticalFailureNode ?? fc.testCriticalFailureNode,
          testFailureNode: storeChoice?.testFailureNode ?? fc.testFailureNode,
          testSuccessNode: storeChoice?.testSuccessNode ?? fc.testSuccessNode,
          testCriticalSuccessNode: storeChoice?.testCriticalSuccessNode ?? fc.testCriticalSuccessNode,
        }
      })
      updateNode(selectedNodeId, {
        data: {
          ...selectedNode.data,
          ...formData,
          choices: mergedChoices,
        },
      })
    }
    const state = useGraphStore.getState()
    const parentAfterSync = state.nodes.find((n) => n.id === selectedNodeId)
    const choices = (parentAfterSync?.data?.choices || []) as Choice[]
    const currentChoice = choices[choiceIndex]
    const oldTargetNode = currentChoice?.targetNode
    if (oldTargetNode && oldTargetNode !== 'END') {
      const stableId = (currentChoice as Choice & { choiceId?: string })?.choiceId ?? `__idx_${choiceIndex}`
      const edgeId = stableChoiceEdgeId(selectedNodeId, stableId)
      if (state.edges.some((e) => e.id === edgeId)) {
        disconnectNodes(edgeId)
      }
    }
    const pos = parentAfterSync?.position ?? selectedNode.position
    const position = { x: pos.x + choiceIndex * 200, y: pos.y + 280 }
    const node = createEmptyNode(position)
    addNode(node)
    connectNodes(selectedNodeId, node.id, choiceIndex)
    setSelectedNode(node.id)
  }, [selectedNodeId, selectedNode, nodeType, form, updateNode, createEmptyNode, addNode, connectNodes, disconnectNodes, setSelectedNode])
  
  // Handler pour générer pour un choix spécifique
  const handleGenerateForChoice = useCallback(async (choiceIndex: number) => {
    if (!selectedNodeId) return
    
    // Si pas d'instructions, utiliser un prompt par défaut
    const instructions = userInstructions.trim() || 'Continue la conversation de manière naturelle'
    
    try {
      const allCharacters = [
        ...(selections.characters_full || []),
        ...(selections.characters_excerpt || []),
      ]
      const npcSpeakerId = allCharacters.length > 0 ? allCharacters[0] : undefined
      
      const generationResult = await generateFromNode(
        selectedNodeId,
        instructions,
        {
          context_selections: selections,
          npc_speaker_id: npcSpeakerId,
          llm_model_identifier: llmModel,
          target_choice_index: choiceIndex,
        }
      )
      
      toast('Nœud généré avec succès', 'success', 2000)
      
      // Focus automatique vers le nouveau nœud
      if (generationResult.nodeId) {
        setSelectedNode(generationResult.nodeId)
        const event = new CustomEvent('focus-generated-node', {
          detail: { nodeId: generationResult.nodeId }
        })
        window.dispatchEvent(event)
      }
      
      setShowGenerationOptions(false)
      setUserInstructions('')
    } catch (err) {
      toast(`Erreur lors de la génération: ${getErrorMessage(err)}`, 'error')
    }
  }, [selectedNodeId, userInstructions, selections, llmModel, generateFromNode, setSelectedNode, toast])
  
  // Handler pour générer pour tous les choix
  const handleGenerateAllChoices = useCallback(async () => {
    if (!selectedNodeId) {
      toast('Aucun nœud sélectionné', 'warning')
      return
    }
    
    try {
      const allCharacters = [
        ...(selections.characters_full || []),
        ...(selections.characters_excerpt || []),
      ]
      const npcSpeakerId = allCharacters.length > 0 ? allCharacters[0] : undefined
      
      // Si les instructions sont vides, on utilisera un texte par défaut côté backend
      const finalInstructions = userInstructions.trim() || "Ecris la réponse du PNJ à ce que dit le PJ"
      
      const generationResult = await generateFromNode(
        selectedNodeId,
        finalInstructions,
        {
          context_selections: selections,
          npc_speaker_id: npcSpeakerId,
          llm_model_identifier: llmModel,
          generate_all_choices: true,
          onBatchProgress: (current: number, total: number) => {
            setBatchProgress({ current, total })
          },
        }
      )
      
      toast('Nœuds générés avec succès', 'success', 2000)
      
      // Focus automatique vers le premier nouveau nœud
      if (generationResult.nodeId) {
        setSelectedNode(generationResult.nodeId)
        const event = new CustomEvent('focus-generated-node', {
          detail: { nodeId: generationResult.nodeId }
        })
        window.dispatchEvent(event)
      }
      
      setShowGenerationOptions(false)
      setUserInstructions('')
    } catch (err) {
      toast(`Erreur lors de la génération: ${getErrorMessage(err)}`, 'error')
    } finally {
      setBatchProgress(null)
    }
  }, [selectedNodeId, userInstructions, selections, llmModel, generateFromNode, setSelectedNode, toast])

  // Hooks appelés unconditionnellement pour respecter les Rules of Hooks (ordre stable entre rendus).
  const choices = watch('choices') as Choice[] | undefined

  const graphEstimateRequest = useMemo(
    () =>
      selectedNodeId && selectedNode
        ? {
            parent_node_id: selectedNodeId,
            parent_node_content: (selectedNode.data ?? {}) as Record<string, unknown>,
            user_instructions: userInstructions.trim() || 'Ecris la réponse du PNJ à ce que dit le PJ',
            context_selections: selections as Record<string, unknown>,
            llm_model_identifier: llmModel,
          }
        : null,
    [selectedNodeId, selectedNode, userInstructions, selections, llmModel]
  )
  const { result: estimationResult, state: estimationState, error: estimationError, runEstimate, budgetExceeded, budgetWarning90 } = useEstimation({
    type: 'graph',
    request: graphEstimateRequest,
  })

  if (!selectedNode) {
    return (
      <div
        style={{
          padding: '2rem 1rem',
          textAlign: 'center',
          color: theme.text.secondary,
        }}
      >
        Sélectionnez un nœud dans le graphe pour l'éditer
      </div>
    )
  }

  return (
    <FormProvider {...form}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          height: '100%',
          overflow: 'auto',
        }}
      >
        {/* ID du nœud (readonly) */}
        <div>
          <label
            style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontSize: '0.85rem',
              fontWeight: 'bold',
              color: theme.text.secondary,
            }}
          >
            ID du nœud
          </label>
          <input
            type="text"
            {...register('id')}
            readOnly
            style={{
              width: '100%',
              padding: '0.5rem',
              border: `1px solid ${theme.border.primary}`,
              borderRadius: 4,
              backgroundColor: theme.background.panel,
              color: theme.text.secondary,
              fontSize: '0.9rem',
              fontFamily: 'monospace',
            }}
          />
        </div>
        
        {/* Type de nœud */}
        <div>
          <label
            style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontSize: '0.85rem',
              fontWeight: 'bold',
              color: theme.text.secondary,
            }}
          >
            Type
          </label>
          <input
            type="text"
            value={nodeType}
            readOnly
            style={{
              width: '100%',
              padding: '0.5rem',
              border: `1px solid ${theme.border.primary}`,
              borderRadius: 4,
              backgroundColor: theme.background.panel,
              color: theme.text.secondary,
              fontSize: '0.9rem',
            }}
          />
        </div>
        
        {/* Speaker (pour dialogue nodes) */}
        {nodeType === 'dialogueNode' && (
          <div>
            <label
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.85rem',
                fontWeight: 'bold',
                color: theme.text.primary,
              }}
            >
              Speaker
            </label>
            <input
              type="text"
              {...register('speaker')}
              placeholder="Nom du personnage"
              style={{
                width: '100%',
                padding: '0.5rem',
                border: `1px solid ${(errors as FieldErrors<DialogueNodeData>).speaker ? theme.state.error.border : theme.border.primary}`,
                borderRadius: 4,
                backgroundColor: theme.background.tertiary,
                color: theme.text.primary,
                fontSize: '0.9rem',
              }}
            />
          </div>
        )}
        
        {/* Line (dialogue) */}
        {(nodeType === 'dialogueNode' || nodeType === 'testNode') && (
          <div>
            <label
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.85rem',
                fontWeight: 'bold',
                color: theme.text.primary,
              }}
            >
              Dialogue
            </label>
            <textarea
              {...register('line')}
              placeholder="Texte du dialogue..."
              rows={9}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: `1px solid ${(errors as FieldErrors<DialogueNodeData>).line ? theme.state.error.border : theme.border.primary}`,
                borderRadius: 4,
                backgroundColor: theme.background.tertiary,
                color: theme.text.primary,
                fontSize: '0.9rem',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
          </div>
        )}
        
        {/* Test (pour test nodes) */}
        {nodeType === 'testNode' && (
          <div>
            <label
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.85rem',
                fontWeight: 'bold',
                color: theme.text.primary,
              }}
            >
              Test d'attribut *
            </label>
            <input
              type="text"
              {...register('test', { required: true })}
              placeholder="Format: Attribut+Compétence:DD"
              style={{
                width: '100%',
                padding: '0.5rem',
                border: `1px solid ${(errors as FieldErrors<TestNodeData>).test ? theme.state.error.border : theme.border.primary}`,
                borderRadius: 4,
                backgroundColor: theme.background.tertiary,
                color: theme.text.primary,
                fontSize: '0.9rem',
                fontFamily: 'monospace',
              }}
            />
            {(errors as FieldErrors<TestNodeData>).test && (
              <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: theme.state.error.color }}>
                {(errors as FieldErrors<TestNodeData>).test?.message}
              </div>
            )}
            <div
              style={{
                marginTop: '0.25rem',
                fontSize: '0.75rem',
                color: theme.text.secondary,
                fontStyle: 'italic',
              }}
            >
              Ex: Raison+Rhétorique:8
            </div>
          </div>
        )}
        
        {/* Résultats de test (pour test nodes) */}
        {nodeType === 'testNode' && (
          <div style={{ marginBottom: '0.75rem', padding: '0.75rem', backgroundColor: theme.background.secondary, borderRadius: 6, border: `1px solid ${theme.border.primary}` }}>
            <h5 style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem', fontWeight: 'bold', color: theme.text.primary }}>
              Connexions de test
            </h5>
            
            {/* Échec critique */}
            <div style={{ marginBottom: '0.75rem' }}>
              <label
                htmlFor="test-critical-failure-node"
                style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontSize: '0.85rem',
                  fontWeight: 'bold',
                  color: theme.text.secondary,
                }}
              >
                Échec critique
              </label>
              <input
                id="test-critical-failure-node"
                type="text"
                {...register('criticalFailureNode' as const)}
                placeholder="ID du nœud (ex: NODE_CRITICAL_FAILURE)"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: `1px solid ${theme.border.primary}`,
                  borderRadius: 4,
                  backgroundColor: theme.background.tertiary,
                  color: theme.text.primary,
                  fontSize: '0.85rem',
                  fontFamily: 'monospace',
                }}
              />
            </div>
            
            {/* Échec */}
            <div style={{ marginBottom: '0.75rem' }}>
              <label
                htmlFor="test-failure-node"
                style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontSize: '0.85rem',
                  fontWeight: 'bold',
                  color: theme.text.secondary,
                }}
              >
                Échec
              </label>
              <input
                id="test-failure-node"
                type="text"
                {...register('failureNode' as const)}
                placeholder="ID du nœud (ex: NODE_FAILURE)"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: `1px solid ${theme.border.primary}`,
                  borderRadius: 4,
                  backgroundColor: theme.background.tertiary,
                  color: theme.text.primary,
                  fontSize: '0.85rem',
                  fontFamily: 'monospace',
                }}
              />
            </div>
            
            {/* Réussite */}
            <div style={{ marginBottom: '0.75rem' }}>
              <label
                htmlFor="test-success-node"
                style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontSize: '0.85rem',
                  fontWeight: 'bold',
                  color: theme.text.secondary,
                }}
              >
                Réussite
              </label>
              <input
                id="test-success-node"
                type="text"
                {...register('successNode' as const)}
                placeholder="ID du nœud (ex: NODE_SUCCESS)"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: `1px solid ${theme.border.primary}`,
                  borderRadius: 4,
                  backgroundColor: theme.background.tertiary,
                  color: theme.text.primary,
                  fontSize: '0.85rem',
                  fontFamily: 'monospace',
                }}
              />
            </div>
            
            {/* Réussite critique */}
            <div style={{ marginBottom: '0.75rem' }}>
              <label
                htmlFor="test-critical-success-node"
                style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontSize: '0.85rem',
                  fontWeight: 'bold',
                  color: theme.text.secondary,
                }}
              >
                Réussite critique
              </label>
              <input
                id="test-critical-success-node"
                type="text"
                {...register('criticalSuccessNode' as const)}
                placeholder="ID du nœud (ex: NODE_CRITICAL_SUCCESS)"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: `1px solid ${theme.border.primary}`,
                  borderRadius: 4,
                  backgroundColor: theme.background.tertiary,
                  color: theme.text.primary,
                  fontSize: '0.85rem',
                  fontFamily: 'monospace',
                }}
              />
            </div>
          </div>
        )}

        {/* Raccourci génération pour TestNode : ouvre le panneau IA avec le choix parent pré-sélectionné */}
        {nodeType === 'testNode' && selectedNodeId && (() => {
          const parentInfo = getParentChoiceForTestNode(selectedNodeId, nodes)
          if (!parentInfo) return null
          return (
            <div
              style={{
                padding: '1rem',
                backgroundColor: theme.background.secondary,
                borderRadius: 6,
                border: `1px solid ${theme.border.primary}`,
              }}
            >
              <h3 style={{ margin: 0, marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: 'bold', color: theme.text.primary }}>
                ✨ Génération IA
              </h3>
              <button
                type="button"
                onClick={() => {
                  setSelectedNode(parentInfo.dialogueNodeId)
                  window.dispatchEvent(
                    new CustomEvent('open-ai-generation-panel', {
                      detail: { nodeId: parentInfo.dialogueNodeId, choiceIndex: parentInfo.choiceIndex },
                    })
                  )
                }}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: 'none',
                  borderRadius: 4,
                  backgroundColor: theme.button.primary.background,
                  color: theme.button.primary.color,
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: 'bold',
                }}
              >
                ✨ Générer la suite pour ce test
              </button>
            </div>
          )
        })()}
        
        {/* Choix (pour dialogue nodes) */}
        {nodeType === 'dialogueNode' && (
          <ChoicesEditor
            onGenerateForChoice={handleGenerateForChoice}
            onCreateEmptyNodeForChoice={handleCreateEmptyNodeForChoice}
          />
        )}
        
        {/* Section Génération IA */}
        {nodeType === 'dialogueNode' && (
          <div
            style={{
              padding: '1rem',
              backgroundColor: theme.background.secondary,
              borderRadius: 6,
              border: `1px solid ${theme.border.primary}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 'bold', color: theme.text.primary }}>
                ✨ Génération IA
              </h3>
              <button
                type="button"
                onClick={() => setShowGenerationOptions(!showGenerationOptions)}
                style={{
                  padding: '0.5rem 0.75rem',
                  border: `1px solid ${theme.border.primary}`,
                  borderRadius: 4,
                  backgroundColor: showGenerationOptions ? theme.button.primary.background : theme.button.default.background,
                  color: showGenerationOptions ? theme.button.primary.color : theme.button.default.color,
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                {showGenerationOptions ? 'Masquer' : 'Afficher'}
              </button>
            </div>
            
            {showGenerationOptions && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {/* Instructions */}
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 'bold', color: theme.text.primary }}>
                    Instructions pour la génération
                  </label>
                  <textarea
                    value={userInstructions}
                    onChange={(e) => setUserInstructions(e.target.value)}
                    placeholder="Décrivez ce que vous voulez générer..."
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: `1px solid ${theme.border.primary}`,
                      borderRadius: 4,
                      backgroundColor: theme.background.tertiary,
                      color: theme.text.primary,
                      fontSize: '0.9rem',
                      fontFamily: 'inherit',
                      resize: 'vertical',
                    }}
                  />
                </div>
                
                {/* Modèle LLM */}
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 'bold', color: theme.text.primary }}>
                    Modèle LLM
                  </label>
                  <select
                    value={llmModel}
                    onChange={(e) => setLlmModel(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: `1px solid ${theme.border.primary}`,
                      borderRadius: 4,
                      backgroundColor: theme.background.tertiary,
                      color: theme.text.primary,
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
                
                {/* Estimation unifiée (même composant que panneau Générer nœud) */}
                {graphEstimateRequest && (
                  <EstimationBadge
                    result={estimationResult}
                    state={estimationState}
                    error={estimationError}
                    onEstimate={runEstimate}
                    budgetExceeded={budgetExceeded}
                    budgetWarning90={budgetWarning90}
                    showWhenIdle={true}
                  />
                )}
                
                {/* Boutons de génération */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {/* Bouton "Générer la suite" (nextNode) */}
                  <button
                    type="button"
                    onClick={handleGenerateNext}
                    disabled={isGenerating || budgetExceeded}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: 'none',
                      borderRadius: 4,
                      backgroundColor: theme.button.primary.background,
                      color: theme.button.primary.color,
                      cursor: isGenerating || budgetExceeded ? 'not-allowed' : 'pointer',
                      opacity: isGenerating || budgetExceeded ? 0.6 : 1,
                      fontSize: '0.9rem',
                      fontWeight: 'bold',
                    }}
                  >
                    {isGenerating ? 'Génération...' : '✨ Générer la suite (nextNode)'}
                  </button>
                  
                  {/* Bouton "Générer pour tous les choix" si plusieurs choix sans targetNode */}
                  {(() => {
                    const unconnectedChoices = (choices || []).filter(
                      (choice: Choice) => !choice.targetNode || choice.targetNode === 'END'
                    )
                    return unconnectedChoices.length > 1 ? (
                      <button
                        type="button"
                        onClick={handleGenerateAllChoices}
                        disabled={isGenerating || budgetExceeded}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: `1px solid ${theme.border.primary}`,
                          borderRadius: 4,
                          backgroundColor: theme.button.default.background,
                          color: theme.button.default.color,
                          cursor: isGenerating || budgetExceeded ? 'not-allowed' : 'pointer',
                          opacity: isGenerating || budgetExceeded ? 0.6 : 1,
                          fontSize: '0.9rem',
                        }}
                      >
                        {isGenerating
                          ? batchProgress?.total
                            ? `Génération ${batchProgress.current}/${batchProgress.total}...`
                            : 'Génération batch...'
                          : `✨ Générer pour tous les choix (${unconnectedChoices.length})`}
                      </button>
                    ) : null
                  })()}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Actions */}
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            marginTop: 'auto',
            paddingTop: '1rem',
          }}
        >
          <button
            type="submit"
            style={{
              flex: 1,
              padding: '0.75rem',
              border: 'none',
              borderRadius: 4,
              backgroundColor: theme.button.primary.background,
              color: theme.button.primary.color,
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 'bold',
            }}
          >
            💾 Sauvegarder
          </button>

          <button
            type="button"
            onClick={handleDuplicate}
            style={{
              padding: '0.75rem',
              border: `1px solid ${theme.border.primary}`,
              borderRadius: 4,
              backgroundColor: theme.button.default.background,
              color: theme.text.primary,
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 'bold',
            }}
            title="Dupliquer ce nœud"
          >
            👯
          </button>
          
          <button
            type="button"
            onClick={handleDelete}
            style={{
              padding: '0.75rem',
              border: `1px solid ${theme.border.primary}`,
              borderRadius: 4,
              backgroundColor: '#E74C3C',
              color: 'white',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 'bold',
            }}
          >
            🗑️
          </button>
        </div>
      </form>
    </FormProvider>
  )
})

/**
 * Composant interne pour gérer les choix avec useFieldArray.
 */
interface ChoicesEditorProps {
  onGenerateForChoice?: (choiceIndex: number) => void
  onCreateEmptyNodeForChoice?: (choiceIndex: number) => void
}

function ChoicesEditor({ onGenerateForChoice, onCreateEmptyNodeForChoice }: ChoicesEditorProps) {
  const { control, getValues } = useFormContext<DialogueNodeData>()
  const { selectedNodeId, updateNode, selectedNode } = useGraphStore()
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'choices',
  })
  
  // Handler pour supprimer un choix et synchroniser avec le store
  const handleRemoveChoice = useCallback((index: number) => {
    if (!selectedNodeId || !selectedNode) return
    
    const storeChoices = (selectedNode.data?.choices || []) as Choice[]
    if (index < 0 || index >= storeChoices.length) return
    
    // Obtenir les données du formulaire avant suppression
    const formData = getValues() as DialogueNodeData
    
    // Supprimer le choix du tableau des choix du store
    const updatedChoices = storeChoices.filter((_, i) => i !== index)
    
    // Construire les données mises à jour en fusionnant les données du formulaire avec les choix mis à jour
    // (pour préserver les champs du formulaire comme line, speaker, etc.)
    const updatedData: DialogueNodeData = {
      ...formData,
      choices: updatedChoices.map((sc, i) => {
        // Fusionner avec les données du formulaire pour les choix restants
        const formChoice = formData.choices?.[i < index ? i : i + 1] // Décaler l'index si après l'index supprimé
        return {
          ...(formChoice || {}),
          // Préserver les champs de connexion du store
          targetNode: sc.targetNode,
          testCriticalFailureNode: sc.testCriticalFailureNode,
          testFailureNode: sc.testFailureNode,
          testSuccessNode: sc.testSuccessNode,
          testCriticalSuccessNode: sc.testCriticalSuccessNode,
          // Préserver choiceId si présent
          choiceId: (sc as Choice & { choiceId?: string })?.choiceId ?? formChoice?.choiceId,
        }
      }),
    }
    
    // Mettre à jour le nœud dans le store avec les choix mis à jour
    // updateNode gérera automatiquement la suppression des TestNodes associés si nécessaire
    updateNode(selectedNodeId, {
      data: {
        ...selectedNode.data,
        ...updatedData,
      },
    })
    
    // Supprimer le choix du formulaire après la mise à jour du store
    remove(index)
  }, [selectedNodeId, selectedNode, remove, getValues, updateNode])
  
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <label
          style={{
            display: 'block',
            fontSize: '0.85rem',
            fontWeight: 'bold',
            color: theme.text.primary,
          }}
        >
          Choix ({fields.length})
        </label>
        <button
          type="button"
          onClick={() => append({ text: '', targetNode: 'END' })}
          style={{
            padding: '0.5rem 0.75rem',
            border: `1px solid ${theme.border.primary}`,
            borderRadius: 4,
            backgroundColor: theme.button.default.background,
            color: theme.button.default.color,
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          + Ajouter un choix
        </button>
      </div>
      
      {fields.length === 0 ? (
        <div
          style={{
            padding: '1rem',
            backgroundColor: theme.background.panel,
            borderRadius: 4,
            border: `1px dashed ${theme.border.primary}`,
            textAlign: 'center',
            color: theme.text.secondary,
            fontSize: '0.85rem',
          }}
        >
          Aucun choix. Cliquez sur "Ajouter un choix" pour en créer un.
        </div>
      ) : (
        fields.map((field, index) => (
          <ChoiceEditor
            key={field.id}
            choiceIndex={index}
            onRemove={fields.length > 1 ? () => handleRemoveChoice(index) : undefined}
            onGenerateForChoice={onGenerateForChoice}
            onCreateEmptyNodeForChoice={onCreateEmptyNodeForChoice}
          />
        ))
      )}
    </div>
  )
}
