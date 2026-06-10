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
import { useGraphViewStore } from '../../store/graphViewStore'
import { useContextStore } from '../../store/contextStore'
import { useToast } from '../shared'
import { theme } from '../../theme'
import { remSize } from '../../theme/uiTypography'
import { getErrorMessage } from '../../types/errors'
import { DEFAULT_MODEL } from '../../constants'
import { StyledSelect } from '../shared/StyledSelect'
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
import { countExpandedBatchNodesForChoices } from '../../utils/graphChoiceLabels'
import {
  childNodeTopLeftX,
  GRAPH_DIALOGUE_NODE_WIDTH,
  GRAPH_OFFSET_PARENT_TO_CHILD_Y,
} from '../../utils/graphNodeLayout'
import {
  mergeNodeFormIntoStoreData,
  mergeDialogueNodeFormIntoStoreData,
  connectionFingerprintFromNodeData,
  applyStoreConnectionFieldsToDialogueFormChoices,
  applyLinearNextNodeFromGraphEdges,
} from '../../utils/mergeNodeEditorForm'
import { ChoiceEditor } from './ChoiceEditor'
import { ConditionEditor } from './conditions/ConditionEditor'
import { ConnectionTargetSelect } from './ConnectionTargetSelect'
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
  } = useGraphStore()
  const { selections } = useContextStore()
  const toast = useToast()
  const [showGenerationOptions, setShowGenerationOptions] = useState(false)
  const [userInstructions, setUserInstructions] = useState('')
  const [llmModel, setLlmModel] = useState<string>(DEFAULT_MODEL)
  const [availableModels, setAvailableModels] = useState<LLMModelResponse[]>([])
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null)
  /** Valeurs lues au moment de l'appel API (évite closures périmées pendant await generateFromNode). */
  const selectionsRef = useRef(selections)
  selectionsRef.current = selections
  const llmModelRef = useRef(llmModel)
  llmModelRef.current = llmModel
  const userInstructionsRef = useRef(userInstructions)
  userInstructionsRef.current = userInstructions
  
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
          title: (selectedNode?.data?.title as string) ?? '',
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
  
  const { register, handleSubmit, formState: { errors }, reset, watch, setValue } = form
  const isFlushingRef = useRef(false)
  const previousSelectedNodeIdRef = useRef<string | null>(null)
  const debouncePushRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const selectedNodeIdRef = useRef<string | null>(selectedNodeId ?? null)
  const nodeTypeRef = useRef(nodeType)
  const flushCurrentFormToStoreRef = useRef<() => void>(() => {})
  /** Dernière empreinte des champs « connexion » du nœud sélectionné (évite resync inutile + boucles). */
  const prevConnectionFingerprintRef = useRef<string>('')

  const DEBOUNCE_MS = 100

  selectedNodeIdRef.current = selectedNodeId ?? null
  nodeTypeRef.current = nodeType

  const flushFormToStore = useCallback((nodeId: string, targetNodeType: string) => {
    const state = useGraphStore.getState()
    const node = state.nodes.find((n) => n.id === nodeId)
    if (!node?.data) return
    const formValues = form.getValues()
    let merged = mergeNodeFormIntoStoreData(
      targetNodeType,
      node.data as Record<string, unknown>,
      formValues
    )
    if (targetNodeType === 'dialogueNode') {
      merged = applyLinearNextNodeFromGraphEdges(nodeId, merged, state.edges)
    }
    if (JSON.stringify(merged) === JSON.stringify(node.data)) return
    updateNode(nodeId, { data: merged })
  }, [form, updateNode])

  flushCurrentFormToStoreRef.current = () => {
    const currentId = selectedNodeIdRef.current
    if (!currentId) return
    flushFormToStore(currentId, nodeTypeRef.current)
  }

  useEffect(() => {
    return () => {
      if (debouncePushRef.current) {
        clearTimeout(debouncePushRef.current)
        debouncePushRef.current = null
      }
      flushCurrentFormToStoreRef.current()
    }
  }, [])

  // ADR-006 : pousser le formulaire vers le store à la saisie (debounce ≤ 100 ms), pas de brouillon.
  // getState() dans le callback : lecture de l'état au moment de l'exécution (après 100 ms), pas dans le render.
  const watchedValues = watch()
  useEffect(() => {
    if (!selectedNodeId) return
    if (debouncePushRef.current) clearTimeout(debouncePushRef.current)
    debouncePushRef.current = setTimeout(() => {
      debouncePushRef.current = null
      if (useGraphStore.getState().selectedNodeId !== selectedNodeId) return
      flushFormToStore(selectedNodeId, nodeType)
    }, DEBOUNCE_MS)
    return () => {
      if (debouncePushRef.current) {
        clearTimeout(debouncePushRef.current)
        debouncePushRef.current = null
      }
    }
  }, [watchedValues, selectedNodeId, nodeType, flushFormToStore])

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
        let merged = mergeNodeFormIntoStoreData(prevNodeType, prevNode.data as Record<string, unknown>, values)
        if (prevNodeType === 'dialogueNode') {
          merged = applyLinearNextNodeFromGraphEdges(prevId, merged, state.edges)
        }
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
          title: (selectedNode.data.title as string) ?? '',
          speaker: selectedNode.data.speaker || '',
          line: selectedNode.data.line || '',
          visibilityConditions: selectedNode.data.visibilityConditions as
            | DialogueNodeData['visibilityConditions']
            | undefined,
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
      prevConnectionFingerprintRef.current = connectionFingerprintFromNodeData(
        nodeType,
        selectedNode.data as Record<string, unknown>
      )
    } else if (selectionChanged) {
      prevConnectionFingerprintRef.current = ''
    }
  }, [selectedNodeId, selectedNode, nodeType, reset, form, updateNode])

  // Même nœud sélectionné : le store peut mettre à jour les connexions (génération, edges) sans resélection.
  useEffect(() => {
    if (!selectedNodeId || !selectedNode?.data) return
    const fp = connectionFingerprintFromNodeData(
      nodeType,
      selectedNode.data as Record<string, unknown>
    )
    if (fp === prevConnectionFingerprintRef.current) return
    if (debouncePushRef.current) {
      clearTimeout(debouncePushRef.current)
      debouncePushRef.current = null
    }
    prevConnectionFingerprintRef.current = fp
    if (nodeType === 'testNode') {
      const d = selectedNode.data as Record<string, unknown>
      setValue('criticalFailureNode', (d.criticalFailureNode as string) || '', { shouldDirty: false })
      setValue('failureNode', (d.failureNode as string) || '', { shouldDirty: false })
      setValue('successNode', (d.successNode as string) || '', { shouldDirty: false })
      setValue('criticalSuccessNode', (d.criticalSuccessNode as string) || '', { shouldDirty: false })
      return
    }
    if (nodeType === 'dialogueNode') {
      const storeChoices = (selectedNode.data.choices || []) as Choice[]
      const formChoices = (form.getValues() as DialogueNodeData).choices || []
      const merged = applyStoreConnectionFieldsToDialogueFormChoices(storeChoices, formChoices)
      setValue('choices', merged, { shouldDirty: false })
      setValue('nextNode', (selectedNode.data.nextNode as string) || '', { shouldDirty: false })
      setValue(
        'visibilityConditions',
        (selectedNode.data.visibilityConditions as DialogueNodeData['visibilityConditions']) ??
          undefined,
        { shouldDirty: false },
      )
    }
  }, [selectedNodeId, selectedNode, nodeType, form, setValue])

  const onSubmit = useCallback((data: DialogueNodeData | TestNodeData | EndNodeData) => {
    if (!selectedNodeId) return
    if (nodeType === 'dialogueNode') {
      const line = (data as DialogueNodeData).line ?? ''
      if (typeof line === 'string' && line.trim() === '') {
        toast('Nœud vide - ajouter du texte', 'warning')
      }
    }
    const st = useGraphStore.getState()
    const liveNode = st.nodes.find((n) => n.id === selectedNodeId)
    let merged = mergeNodeFormIntoStoreData(
      nodeType,
      (liveNode?.data as Record<string, unknown> | undefined) ?? {},
      data
    )
    if (nodeType === 'dialogueNode' && selectedNodeId) {
      merged = applyLinearNextNodeFromGraphEdges(selectedNodeId, merged, st.edges)
    }
    updateNode(selectedNodeId, {
      data: merged,
    })
    if (!isFlushingRef.current) {
      useGraphViewStore.getState().requestSave()
    }
  }, [selectedNodeId, nodeType, updateNode, toast])

  const flushRequested = useGraphViewStore((s) => s.flushRequested)
  useEffect(() => {
    if (!flushRequested) return
    isFlushingRef.current = true
    form.handleSubmit(onSubmit)()
      .then(() => { useGraphViewStore.getState().confirmFlush() })
      .catch(() => { useGraphViewStore.getState().confirmFlush() })
      .finally(() => { isFlushingRef.current = false })
  }, [flushRequested, form, onSubmit])
  
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
      // Si les instructions sont vides, on utilisera un texte par défaut côté backend
      const finalInstructions =
        userInstructionsRef.current.trim() || "Ecris la réponse du PNJ à ce que dit le PJ"
      const sel = selectionsRef.current
      const allCharsForNpc = [...(sel.characters_full || []), ...(sel.characters_excerpt || [])]
      const npcFromSel = allCharsForNpc.length > 0 ? allCharsForNpc[0] : undefined

      const generationResult = await generateFromNode(
        selectedNodeId,
        finalInstructions,
        {
          context_selections: sel,
          npc_speaker_id: npcFromSel,
          llm_model_identifier: llmModelRef.current,
        }
      )
      
      toast('Nœud généré avec succès', 'success', 2000)
      
      if (generationResult.nodeId) {
        setSelectedNode(generationResult.nodeId)
        useGraphViewStore.getState().focusNode(generationResult.nodeId)
      }
      
      setShowGenerationOptions(false)
      setUserInstructions('')
    } catch (err) {
      toast(`Erreur lors de la génération: ${getErrorMessage(err)}`, 'error')
    }
  }, [selectedNodeId, selectedNode?.data?.choices, generateFromNode, setSelectedNode, toast])

  /** Créer un nœud vide et le lier comme cible du choix (panneau Détails, par choix). */
  const handleCreateEmptyNodeForChoice = useCallback((choiceIndex: number) => {
    if (!selectedNodeId || !selectedNode) return
    const formData = form.getValues() as DialogueNodeData
    if (nodeType === 'dialogueNode') {
      const mergedData = mergeDialogueNodeFormIntoStoreData(
        selectedNode.data as Record<string, unknown>,
        formData
      )
      updateNode(selectedNodeId, { data: mergedData })
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
    const position = {
      x: childNodeTopLeftX({
        parentX: pos.x,
        parentWidth: GRAPH_DIALOGUE_NODE_WIDTH,
        childWidth: GRAPH_DIALOGUE_NODE_WIDTH,
        siblingIndex: choiceIndex,
        siblingCount: Math.max(choices.length, 1),
      }),
      y: pos.y + GRAPH_OFFSET_PARENT_TO_CHILD_Y,
    }
    const node = createEmptyNode(position)
    addNode(node)
    connectNodes(selectedNodeId, node.id, choiceIndex)
    setSelectedNode(node.id)
  }, [selectedNodeId, selectedNode, nodeType, form, updateNode, createEmptyNode, addNode, connectNodes, disconnectNodes, setSelectedNode])
  
  // Handler pour générer pour un choix spécifique
  const handleGenerateForChoice = useCallback(async (choiceIndex: number) => {
    if (!selectedNodeId) return
    
    // Si pas d'instructions, utiliser un prompt par défaut
    const instructions =
      userInstructionsRef.current.trim() || 'Continue la conversation de manière naturelle'
    
    try {
      const sel = selectionsRef.current
      const allChars = [...(sel.characters_full || []), ...(sel.characters_excerpt || [])]
      const npcSpeakerId = allChars.length > 0 ? allChars[0] : undefined
      
      const generationResult = await generateFromNode(
        selectedNodeId,
        instructions,
        {
          context_selections: sel,
          npc_speaker_id: npcSpeakerId,
          llm_model_identifier: llmModelRef.current,
          target_choice_index: choiceIndex,
        }
      )
      
      toast('Nœud généré avec succès', 'success', 2000)
      
      if (generationResult.nodeId) {
        setSelectedNode(generationResult.nodeId)
        useGraphViewStore.getState().focusNode(generationResult.nodeId)
      }
      
      setShowGenerationOptions(false)
      setUserInstructions('')
    } catch (err) {
      toast(`Erreur lors de la génération: ${getErrorMessage(err)}`, 'error')
    }
  }, [selectedNodeId, generateFromNode, setSelectedNode, toast])

  /** Génération depuis le TestNode sélectionné : on envoie son id, le backend renvoie les connexions avec ce même id. */
  const handleGenerateFromTestNode = useCallback(async () => {
    if (!selectedNodeId) return
    const instructions =
      userInstructionsRef.current.trim() || 'Continue la conversation de manière naturelle'
    try {
      const sel = selectionsRef.current
      const allChars = [...(sel.characters_full || []), ...(sel.characters_excerpt || [])]
      const npcSpeakerId = allChars.length > 0 ? allChars[0] : undefined
      const generationResult = await generateFromNode(selectedNodeId, instructions, {
        context_selections: sel,
        npc_speaker_id: npcSpeakerId,
        llm_model_identifier: llmModelRef.current,
      })
      toast('Nœud généré avec succès', 'success', 2000)
      if (generationResult.nodeId) {
        setSelectedNode(generationResult.nodeId)
        useGraphViewStore.getState().focusNode(generationResult.nodeId)
      }
      setShowGenerationOptions(false)
      setUserInstructions('')
    } catch (err) {
      toast(`Erreur lors de la génération: ${getErrorMessage(err)}`, 'error')
    }
  }, [selectedNodeId, generateFromNode, setSelectedNode, toast])

  // Handler pour générer pour tous les choix
  const handleGenerateAllChoices = useCallback(async () => {
    if (!selectedNodeId) {
      toast('Aucun nœud sélectionné', 'warning')
      return
    }
    
    try {
      const sel = selectionsRef.current
      const allChars = [...(sel.characters_full || []), ...(sel.characters_excerpt || [])]
      const npcSpeakerId = allChars.length > 0 ? allChars[0] : undefined
      
      // Si les instructions sont vides, on utilisera un texte par défaut côté backend
      const finalInstructions =
        userInstructionsRef.current.trim() || "Ecris la réponse du PNJ à ce que dit le PJ"

      const st = useGraphStore.getState()
      const dialogueParent = st.nodes.find((n) => n.id === selectedNodeId)
      const unc = (
        (dialogueParent?.data?.choices as Array<{ targetNode?: string; test?: unknown }> | undefined) ?? []
      ).filter((c) => !c.targetNode || c.targetNode === 'END')
      const batchTotal = countExpandedBatchNodesForChoices(unc)
      if (batchTotal > 0) {
        setBatchProgress({ current: 0, total: batchTotal })
      }

      const generationResult = await generateFromNode(
        selectedNodeId,
        finalInstructions,
        {
          context_selections: sel,
          npc_speaker_id: npcSpeakerId,
          llm_model_identifier: llmModelRef.current,
          generate_all_choices: true,
          onBatchProgress: (current: number, total: number) => {
            setBatchProgress({ current, total })
          },
        }
      )
      
      toast('Nœuds générés avec succès', 'success', 2000)
      
      if (generationResult.nodeId) {
        setSelectedNode(generationResult.nodeId)
        useGraphViewStore.getState().focusNode(generationResult.nodeId)
      }
      
      setShowGenerationOptions(false)
      setUserInstructions('')
    } catch (err) {
      toast(`Erreur lors de la génération: ${getErrorMessage(err)}`, 'error')
    } finally {
      setBatchProgress(null)
    }
  }, [selectedNodeId, generateFromNode, setSelectedNode, toast])

  // Hooks appelés unconditionnellement pour respecter les Rules of Hooks (ordre stable entre rendus).
  const choices = watch('choices') as Choice[] | undefined

  const graphEstimateRequest = useMemo(
    () =>
      selectedNodeId && selectedNode
        ? {
            parent_node_id: selectedNodeId,
            parent_node_content: (selectedNode.data ?? {}) as Record<string, unknown>,
            user_instructions: userInstructions.trim() || 'Ecris la réponse du PNJ à ce que dit le PJ',
            context_selections: selections as unknown as Record<string, unknown>,
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
        {/* ID du nœud (readonly, stable) */}
        <div>
          <label
            style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontSize: remSize('accent'),
              fontWeight: 'bold',
              color: theme.text.secondary,
            }}
          >
            ID (stable)
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
              fontSize: remSize('body'),
              fontFamily: 'monospace',
            }}
          />
        </div>

        {/* Titre (éditable, pour dialogueNode) */}
        {nodeType === 'dialogueNode' && (
          <div>
            <label
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: remSize('accent'),
                fontWeight: 'bold',
                color: theme.text.primary,
              }}
            >
              Titre
            </label>
            <input
              type="text"
              {...register('title')}
              placeholder="Libellé du nœud (affichage)"
              style={{
                width: '100%',
                padding: '0.5rem',
                border: `1px solid ${theme.border.primary}`,
                borderRadius: 4,
                backgroundColor: theme.background.tertiary,
                color: theme.text.primary,
                fontSize: remSize('body'),
              }}
            />
          </div>
        )}

        {/* Type de nœud */}
        <div>
          <label
            style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontSize: remSize('accent'),
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
              fontSize: remSize('body'),
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
                fontSize: remSize('accent'),
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
                fontSize: remSize('body'),
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
                fontSize: remSize('accent'),
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
                fontSize: remSize('body'),
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
          </div>
        )}

        {/* Story 9.2 — conditions de visibilité (nœud) */}
        {nodeType === 'dialogueNode' && selectedNodeId && (
          <ConditionEditor variant="node" />
        )}
        
        {/* Test (pour test nodes) */}
        {nodeType === 'testNode' && (
          <div>
            <label
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: remSize('accent'),
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
                fontSize: remSize('body'),
                fontFamily: 'monospace',
              }}
            />
            {(errors as FieldErrors<TestNodeData>).test && (
              <div style={{ marginTop: '0.25rem', fontSize: remSize('caption'), color: theme.state.error.color }}>
                {(errors as FieldErrors<TestNodeData>).test?.message}
              </div>
            )}
            <div
              style={{
                marginTop: '0.25rem',
                fontSize: remSize('caption'),
                color: theme.text.secondary,
                fontStyle: 'italic',
              }}
            >
              Ex: Raison+Rhétorique:8
            </div>
          </div>
        )}
        
        {/* Résultats de test (pour test nodes) */}
        {nodeType === 'testNode' && selectedNodeId && (
          <div style={{ marginBottom: '0.75rem', padding: '0.75rem', backgroundColor: theme.background.secondary, borderRadius: 6, border: `1px solid ${theme.border.primary}` }}>
            <h5 style={{ margin: '0 0 0.75rem 0', fontSize: remSize('accent'), fontWeight: 'bold', color: theme.text.primary }}>
              Connexions de test
            </h5>
            <ConnectionTargetSelect
              variant="testHandle"
              testSourceNodeId={selectedNodeId}
              handle="critical-failure"
              label="Échec critique"
              value={watch('criticalFailureNode') as string | undefined}
              data-testid="panel-test-cf"
            />
            <ConnectionTargetSelect
              variant="testHandle"
              testSourceNodeId={selectedNodeId}
              handle="failure"
              label="Échec"
              value={watch('failureNode') as string | undefined}
              data-testid="panel-test-f"
            />
            <ConnectionTargetSelect
              variant="testHandle"
              testSourceNodeId={selectedNodeId}
              handle="success"
              label="Réussite"
              value={watch('successNode') as string | undefined}
              data-testid="panel-test-s"
            />
            <ConnectionTargetSelect
              variant="testHandle"
              testSourceNodeId={selectedNodeId}
              handle="critical-success"
              label="Réussite critique"
              value={watch('criticalSuccessNode') as string | undefined}
              data-testid="panel-test-cs"
            />
          </div>
        )}

        {/* Raccourci génération pour TestNode : on envoie l’id du TestNode, le backend renvoie les connexions avec ce même id. */}
        {nodeType === 'testNode' && selectedNodeId && (
          <div
            style={{
              padding: '1rem',
              backgroundColor: theme.background.secondary,
              borderRadius: 6,
              border: `1px solid ${theme.border.primary}`,
            }}
          >
            <h3 style={{ margin: 0, marginBottom: '0.75rem', fontSize: remSize('section'), fontWeight: 'bold', color: theme.text.primary }}>
              ✨ Génération IA
            </h3>
            <button
              type="button"
              data-testid="generate-from-test-node"
              onClick={() => handleGenerateFromTestNode()}
              disabled={isGenerating}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: 'none',
                borderRadius: 4,
                backgroundColor: theme.button.primary.background,
                color: theme.button.primary.color,
                cursor: isGenerating ? 'not-allowed' : 'pointer',
                fontSize: remSize('body'),
                fontWeight: 'bold',
                opacity: isGenerating ? 0.7 : 1,
              }}
            >
              {isGenerating ? 'Génération...' : '✨ Générer la suite pour ce test'}
            </button>
          </div>
        )}
        
        {nodeType === 'dialogueNode' && selectedNodeId && !(watch('choices') as Choice[] | undefined)?.length && (
          <ConnectionTargetSelect
            variant="nextNode"
            dialogueNodeId={selectedNodeId}
            label="Nœud suivant"
            value={(watch('nextNode') as string | undefined) || undefined}
            data-testid="connection-target-next-node"
          />
        )}

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
              <h3 style={{ margin: 0, fontSize: remSize('section'), fontWeight: 'bold', color: theme.text.primary }}>
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
                  fontSize: remSize('small'),
                }}
              >
                {showGenerationOptions ? 'Masquer' : 'Afficher'}
              </button>
            </div>
            
            {showGenerationOptions && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {/* Instructions */}
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: remSize('accent'), fontWeight: 'bold', color: theme.text.primary }}>
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
                      fontSize: remSize('body'),
                      fontFamily: 'inherit',
                      resize: 'vertical',
                    }}
                  />
                </div>
                
                {/* Modèle LLM */}
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: remSize('accent'), fontWeight: 'bold', color: theme.text.primary }}>
                    Modèle LLM
                  </label>
                  <StyledSelect
                    value={llmModel}
                    onChange={(e) => setLlmModel(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: `1px solid ${theme.border.primary}`,
                      borderRadius: 4,
                      backgroundColor: theme.background.tertiary,
                      color: theme.text.primary,
                      fontSize: remSize('body'),
                    }}
                  >
                    {availableModels.map((model, index) => (
                      <option key={`${model.model_identifier}-${index}-${model.display_name || ''}`} value={model.model_identifier}>
                        {model.display_name || model.model_identifier}
                      </option>
                    ))}
                  </StyledSelect>
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
                      fontSize: remSize('body'),
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
                    const batchNodeTotal = countExpandedBatchNodesForChoices(unconnectedChoices)
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
                          fontSize: remSize('body'),
                        }}
                      >
                        {isGenerating
                          ? batchProgress?.total
                            ? `Génération ${batchProgress.current}/${batchProgress.total}...`
                            : 'Génération batch...'
                          : `✨ Générer pour tous les choix (${unconnectedChoices.length} choix → ${batchNodeTotal} nœud${batchNodeTotal > 1 ? 's' : ''})`}
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
              fontSize: remSize('body'),
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
              fontSize: remSize('body'),
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
              fontSize: remSize('body'),
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
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId)
  const updateNode = useGraphStore((s) => s.updateNode)
  const selectedNode = useGraphStore(
    useShallow((s) => s.nodes.find((n) => n.id === s.selectedNodeId) ?? null)
  )
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
        const storeText =
          typeof (sc as { text?: string }).text === 'string' ? (sc as { text?: string }).text : ''
        const formText = formChoice?.text?.trim() ? formChoice.text : ''
        return {
          ...(formChoice || {}),
          text: formText || storeText || 'Choix',
          // Préserver les champs de connexion du store
          targetNode: sc.targetNode,
          testCriticalFailureNode: sc.testCriticalFailureNode,
          testFailureNode: sc.testFailureNode,
          testSuccessNode: sc.testSuccessNode,
          testCriticalSuccessNode: sc.testCriticalSuccessNode,
          // Préserver choiceId si présent
          choiceId: (sc as Choice & { choiceId?: string })?.choiceId ?? formChoice?.choiceId,
          visibilityConditions:
            (sc as Choice).visibilityConditions ?? formChoice?.visibilityConditions,
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
            fontSize: remSize('accent'),
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
            fontSize: remSize('small'),
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
            fontSize: remSize('body'),
          }}
        >
          Aucun choix. Cliquez sur "Ajouter un choix" pour en créer un.
        </div>
      ) : (
        fields.map((field, index) =>
          selectedNodeId ? (
            <ChoiceEditor
              key={field.id}
              dialogueNodeId={selectedNodeId}
              choiceIndex={index}
              onRemove={fields.length > 1 ? () => handleRemoveChoice(index) : undefined}
              onGenerateForChoice={onGenerateForChoice}
              onCreateEmptyNodeForChoice={onCreateEmptyNodeForChoice}
            />
          ) : null
        )
      )}
    </div>
  )
}
