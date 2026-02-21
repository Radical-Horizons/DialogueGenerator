/**
 * Hook pour gérer la sauvegarde et le chargement automatique des brouillons.
 * 
 * Extrait la logique de sauvegarde/chargement localStorage depuis GenerationPanel.
 */
import { useState, useEffect, useCallback } from 'react'
import { useGenerationStore } from '../store/generationStore'
import { useContextStore } from '../store/contextStore'
import { CONTEXT_TOKENS_LIMITS } from '../constants'
import type { SaveStatus } from '../components/shared/SaveStatusIndicator'

const DRAFT_STORAGE_KEY = 'generation_draft'

interface DraftData {
  userInstructions: string
  authorProfile: unknown
  systemPromptOverride: string | null
  dialogueStructure: string[]
  sceneSelection: {
    characterA: string | null
    characterB: string | null
    sceneRegion: string | null
    subLocation: string | null
  }
  maxContextTokens: number
  maxCompletionTokens: number | null
  llmModel: string
  reasoningEffort: 'none' | 'low' | 'medium' | 'high' | 'xhigh' | null
  topP: number | null
  maxChoices: number | null
  choicesMode: 'free' | 'capped'
  narrativeTags: string[]
  contextSelections: unknown
  selectedRegion: string | null
  selectedSubLocations: string[]
  timestamp: number
}

export interface UseGenerationDraftReturn {
  /** Sauvegarder le draft */
  saveDraft: () => void
  /** Charger le draft */
  loadDraft: () => void
  /** Indique s'il y a des changements non sauvegardés */
  isDirty: boolean
  /** Statut de sauvegarde */
  saveStatus: SaveStatus
  /** Marquer comme modifié */
  markDirty: () => void
  /** Marquer comme sauvegardé */
  markSaved: () => void
}

export interface UseGenerationDraftOptions {
  /** Instructions utilisateur */
  userInstructions: string
  /** Max tokens pour contexte */
  maxContextTokens: number
  /** Max tokens pour completion */
  maxCompletionTokens: number | null
  /** Modèle LLM */
  llmModel: string
  /** Reasoning effort */
  reasoningEffort: 'none' | 'low' | 'medium' | 'high' | 'xhigh' | null
  /** Top_p (nucleus sampling) */
  topP: number | null
  /** Nombre max de choix */
  maxChoices: number | null
  /** Mode de choix */
  choicesMode: 'free' | 'capped'
  /** Tags narratifs */
  narrativeTags: string[]
  /** Callback pour mettre à jour userInstructions */
  setUserInstructions: (value: string) => void
  /** Callback pour mettre à jour maxContextTokens */
  setMaxContextTokens: (value: number) => void
  /** Callback pour mettre à jour maxCompletionTokens */
  setMaxCompletionTokens: (value: number | null) => void
  /** Callback pour mettre à jour llmModel */
  setLlmModel: (value: string) => void
  /** Callback pour mettre à jour reasoningEffort */
  setReasoningEffort: (value: 'none' | 'low' | 'medium' | 'high' | 'xhigh' | null) => void
  /** Callback pour mettre à jour topP */
  setTopP: (value: number | null) => void
  /** Callback pour mettre à jour maxChoices */
  setMaxChoices: (value: number | null) => void
  /** Callback pour mettre à jour narrativeTags */
  setNarrativeTags: (tags: string[]) => void
  /** Callback pour mettre à jour authorProfile */
  updateAuthorProfile: (profile: unknown) => void
}

/**
 * Hook pour gérer les brouillons de génération (localStorage).
 * 
 * Sauvegarde automatique avec debounce de 2 secondes et chargement au montage.
 * 
 * @param options - Options avec valeurs et setters
 * @returns Fonctions de sauvegarde/chargement et état
 */
export function useGenerationDraft(
  options: UseGenerationDraftOptions
): UseGenerationDraftReturn {
  const {
    userInstructions,
    maxContextTokens,
    maxCompletionTokens,
    llmModel,
    reasoningEffort,
    topP,
    maxChoices,
    choicesMode,
    narrativeTags,
    setUserInstructions,
    setMaxContextTokens,
    setMaxCompletionTokens,
    setLlmModel,
    setReasoningEffort,
    setTopP,
    setMaxChoices,
    setNarrativeTags,
    updateAuthorProfile,
  } = options

  const [isDirty, setIsDirty] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')

  const {
    sceneSelection,
    dialogueStructure,
    systemPromptOverride,
    setDialogueStructure,
    setSystemPromptOverride,
    setSceneSelection,
  } = useGenerationStore()

  const {
    selections,
    selectedRegion,
    selectedSubLocations,
    restoreState: restoreContextState,
  } = useContextStore()

  const saveDraft = useCallback(() => {
    setSaveStatus('saving')
    const draft: DraftData = {
      userInstructions,
      authorProfile: null, // Sera chargé depuis useAuthorProfile
      systemPromptOverride,
      dialogueStructure,
      sceneSelection,
      maxContextTokens,
      maxCompletionTokens,
      llmModel,
      reasoningEffort,
      topP,
      maxChoices,
      choicesMode,
      narrativeTags,
      contextSelections: selections,
      selectedRegion,
      selectedSubLocations,
      timestamp: Date.now(),
    }
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))
      setIsDirty(false)
      setSaveStatus('saved')
    } catch (err) {
      console.error('Erreur lors de la sauvegarde automatique:', err)
      setSaveStatus('error')
    }
  }, [
    userInstructions,
    systemPromptOverride,
    dialogueStructure,
    sceneSelection,
    maxContextTokens,
    maxCompletionTokens,
    llmModel,
    reasoningEffort,
    topP,
    maxChoices,
    choicesMode,
    narrativeTags,
    selections,
    selectedRegion,
    selectedSubLocations,
  ])

  const loadDraft = useCallback(() => {
    try {
      const saved = localStorage.getItem(DRAFT_STORAGE_KEY)
      if (saved) {
        const draft = JSON.parse(saved) as DraftData
        if (draft.userInstructions !== undefined) {
          setUserInstructions(draft.userInstructions)
        }
        if (draft.authorProfile !== undefined) {
          updateAuthorProfile(draft.authorProfile)
        }
        if (draft.systemPromptOverride !== undefined) {
          setSystemPromptOverride(draft.systemPromptOverride)
        }
        if (draft.dialogueStructure !== undefined) {
          setDialogueStructure(draft.dialogueStructure)
        }
        if (draft.sceneSelection !== undefined) {
          setSceneSelection(draft.sceneSelection)
        }
        if (draft.maxContextTokens !== undefined) {
          // Convertir les anciennes valeurs < MIN à MIN minimum
          const value = Math.max(CONTEXT_TOKENS_LIMITS.MIN, draft.maxContextTokens)
          setMaxContextTokens(value)
        }
        if (draft.maxCompletionTokens !== undefined) {
          const clampedMaxCompletionTokens = Math.min(
            Math.max(draft.maxCompletionTokens, 100),
            16000
          )
          setMaxCompletionTokens(clampedMaxCompletionTokens)
        }
        if (draft.llmModel !== undefined && draft.llmModel !== 'unknown') {
          setLlmModel(draft.llmModel)
        }
        if (draft.reasoningEffort !== undefined) {
          setReasoningEffort(draft.reasoningEffort)
        }
        if (draft.topP !== undefined) {
          setTopP(draft.topP)
        }
        if (draft.maxChoices !== undefined) {
          setMaxChoices(draft.maxChoices)
        }
        if (draft.narrativeTags !== undefined) {
          setNarrativeTags(draft.narrativeTags)
        }

        // Charger les sélections de contexte
        if (draft.contextSelections !== undefined) {
          const savedRegion = draft.selectedRegion !== undefined ? draft.selectedRegion : null
          const savedSubLocations =
            draft.selectedSubLocations !== undefined && Array.isArray(draft.selectedSubLocations)
              ? draft.selectedSubLocations
              : []
          restoreContextState(draft.contextSelections, savedRegion, savedSubLocations)
        }
        setIsDirty(false)
        setSaveStatus('saved')
      }
    } catch (err) {
      console.error('Erreur lors du chargement du brouillon:', err)
      setSaveStatus('error')
    }
  }, [
    setUserInstructions,
    updateAuthorProfile,
    setSystemPromptOverride,
    setDialogueStructure,
    setSceneSelection,
    setMaxContextTokens,
    setMaxCompletionTokens,
    setLlmModel,
    setReasoningEffort,
    setTopP,
    setMaxChoices,
    setNarrativeTags,
    restoreContextState,
  ])

  // Charger le draft au montage (une seule fois)
  useEffect(() => {
    loadDraft()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Charger une seule fois au montage

  // Détecter les changements dans sceneSelection (après chargement initial)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  useEffect(() => {
    if (!isInitialLoad) {
      setIsDirty(true)
      setSaveStatus('unsaved')
    }
  }, [sceneSelection, isInitialLoad])

  // Détecter les changements dans les sélections de contexte (après chargement initial)
  useEffect(() => {
    if (!isInitialLoad) {
      setIsDirty(true)
      setSaveStatus('unsaved')
    }
  }, [selections, selectedRegion, selectedSubLocations, isInitialLoad])

  useEffect(() => {
    // Marquer la fin du chargement initial après un court délai
    const timer = setTimeout(() => setIsInitialLoad(false), 1000)
    return () => clearTimeout(timer)
  }, [])

  // Sauvegarde automatique avec debounce (2 secondes)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (isDirty) {
        saveDraft()
      }
    }, 2000) // Sauvegarder 2 secondes après le dernier changement

    return () => clearTimeout(timeoutId)
  }, [isDirty, saveDraft])

  const markDirty = useCallback(() => {
    setIsDirty(true)
    setSaveStatus('unsaved')
  }, [])

  const markSaved = useCallback(() => {
    setIsDirty(false)
    setSaveStatus('saved')
  }, [])

  return {
    saveDraft,
    loadDraft,
    isDirty,
    saveStatus,
    markDirty,
    markSaved,
  }
}
