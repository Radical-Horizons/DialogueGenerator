/**
 * Gestion du chargement, de l'autosave et des events liés au cycle de vie d'un dialogue.
 * Extrait de GraphEditor pour isoler la logique de persistance du rendu.
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import type { RefObject } from 'react'
import { useGraphStore } from '../store/graphStore'
import * as unityDialoguesAPI from '../api/unityDialogues'
import { getErrorMessage } from '../types/errors'
import type { UnityDialogueMetadata } from '../types/api'
import type { UnityDialogueListRef } from '../components/unityDialogues/UnityDialogueList'
import type { UseToastFn } from '../components/shared'

interface RouteTarget {
  normalizedDialogueId: string
  decodedDialogueId: string
}

/** Circuit breaker: backoff après 4xx non-409 pour éviter la boucle d'autosave. */
const AUTOSAVE_4XX_BACKOFF_MS = 10_000

/** Compare dialogue ids whether stored with or without `.json` (liste UI vs documentId stem). */
function normalizeDialogueFilenameKey(filename: string): string {
  return filename.replace(/\.json$/i, '').toLowerCase()
}

export interface UseDialogueLoaderReturn {
  selectedDialogue: UnityDialogueMetadata | null
  setSelectedDialogue: (d: UnityDialogueMetadata | null) => void
  isLoadingDialogue: boolean
  activeDialogueFilename: string | null
  activeDialogueTitle: string | undefined
  hasActiveDialogue: boolean
  handleSave: () => Promise<void>
  dialogueListRef: RefObject<UnityDialogueListRef>
}

export function useDialogueLoader(
  toast: UseToastFn,
  routeTarget: RouteTarget | null,
): UseDialogueLoaderReturn {
  const [selectedDialogue, setSelectedDialogue] = useState<UnityDialogueMetadata | null>(null)
  const [isLoadingDialogue, setIsLoadingDialogue] = useState(false)

  const dialogueListRef = useRef<UnityDialogueListRef>(null)
  const prevSelectedDialogueRef = useRef<UnityDialogueMetadata | null>(null)
  const loadInFlightRef = useRef(false)
  const activeDialogueFilenameRef = useRef<string | null>(null)
  const lastNetworkErrorRef = useRef<{ message: string; timestamp: number } | null>(null)
  const saveRetryBlockedUntilRef = useRef<number>(0)

  const {
    nodes,
    dialogueMetadata,
    loadDialogue,
    loadDialogueByDocumentId,
    loadDialogueFromRawJson,
    saveDialogue,
    validateGraph,
    hasUnsavedChanges,
    documentId,
    isLoading: isGraphLoading,
    isSaving: isGraphSaving,
    isGenerating,
    resetGraph,
    incrementLoadSeq,
  } = useGraphStore()

  const activeDialogueFilename = selectedDialogue?.filename ?? dialogueMetadata.filename ?? null
  const activeDialogueTitle = selectedDialogue?.title ?? dialogueMetadata.title
  const hasActiveDialogue = !!activeDialogueFilename || nodes.length > 0

  useEffect(() => {
    activeDialogueFilenameRef.current = activeDialogueFilename
  }, [activeDialogueFilename])

  useEffect(() => {
    const handleDialogueDeleted = (event: CustomEvent<{ filename: string }>) => {
      const deletedFilename = event.detail.filename
      dialogueListRef.current?.refresh()
      if (selectedDialogue?.filename === deletedFilename) {
        setSelectedDialogue(null)
        resetGraph()
      }
    }
    window.addEventListener('unity-dialogue-deleted', handleDialogueDeleted as EventListener)
    return () => {
      window.removeEventListener('unity-dialogue-deleted', handleDialogueDeleted as EventListener)
    }
  }, [selectedDialogue?.filename, resetGraph])

  useEffect(() => {
    if (!selectedDialogue) {
      prevSelectedDialogueRef.current = null
      return
    }

    const targetFilename = selectedDialogue.filename
    
    const run = async () => {
      if (loadInFlightRef.current && prevSelectedDialogueRef.current?.filename === targetFilename) {
        return
      }
      loadInFlightRef.current = true
      setIsLoadingDialogue(true)
      prevSelectedDialogueRef.current = selectedDialogue

      const state = useGraphStore.getState()
      const currentFilename = state.dialogueMetadata?.filename ?? state.documentId ?? null
      const norm = (s: string) => s.replace(/\.json$/i, '').toLowerCase()
      const isSameDialogue =
        !!currentFilename &&
        !!targetFilename &&
        norm(currentFilename) === norm(targetFilename)
      
      if (isSameDialogue) {
        setIsLoadingDialogue(false)
        loadInFlightRef.current = false
        return
      }

      const leavingDirty =
        state.hasUnsavedChanges &&
        !!currentFilename &&
        !isSameDialogue

      if (leavingDirty) {
        try {
          await saveDialogue()
        } catch (err) {
          console.error('Erreur sauvegarde avant chargement:', err)
          toast(`Impossible de sauvegarder avant changement: ${getErrorMessage(err)}`, 'error')
          loadInFlightRef.current = false
          setIsLoadingDialogue(false)
          return
        }
      }

      // Reset total de l'état avant de commencer un nouveau chargement
      resetGraph()
      const loadSeq = incrementLoadSeq()

      try {
        let loaded = false
        const docIdsToTry = /\.json$/i.test(targetFilename)
          ? [targetFilename.replace(/\.json$/i, ''), targetFilename]
          : [targetFilename, `${targetFilename}.json`]
        for (const documentId of docIdsToTry) {
          try {
            await loadDialogueByDocumentId(documentId)
            loaded = true
            break
          } catch {
            continue
          }
        }
        
        // Vérification de séquence après les tentatives asynchrones
        if (useGraphStore.getState().activeLoadSeq !== loadSeq) {
          loadInFlightRef.current = false
          setIsLoadingDialogue(false)
          return
        }

        if (!loaded) {
          const response = await unityDialoguesAPI.getUnityDialogue(targetFilename)
          // Vérification de séquence après l'appel API externe
          if (useGraphStore.getState().activeLoadSeq !== loadSeq) {
            loadInFlightRef.current = false
            setIsLoadingDialogue(false)
            return
          }
          
          const stem = /\.json$/i.test(targetFilename) ? targetFilename.replace(/\.json$/i, '') : targetFilename
          await loadDialogueFromRawJson(response.json_content, stem || targetFilename)
        }
        
        // Vérification finale avant validation et UI update
        if (useGraphStore.getState().activeLoadSeq !== loadSeq) {
          loadInFlightRef.current = false
          setIsLoadingDialogue(false)
          return
        }

        try {
          await validateGraph()
        } catch (err) {
          console.error('Erreur lors de la validation automatique au chargement:', err)
        }
        loadInFlightRef.current = false
        setIsLoadingDialogue(false)
        const nextState = useGraphStore.getState()
        if (nextState.nodes.length > 0 && !nextState.selectedNodeId) {
          nextState.setSelectedNode(nextState.nodes[0].id)
        }
      } catch (err) {
        if (useGraphStore.getState().activeLoadSeq !== loadSeq) return
        console.error('Erreur lors du chargement du dialogue:', err)
        const errorMessage = getErrorMessage(err)
        const isNetworkError =
          errorMessage.includes('connexion au serveur') ||
          errorMessage.includes('connecter au serveur') ||
          errorMessage.includes('Impossible de se connecter')
        const displayMessage =
          isNetworkError || errorMessage.startsWith('Erreur')
            ? errorMessage
            : `Erreur: ${errorMessage}`
        toast(displayMessage, 'error')
        loadInFlightRef.current = false
        setIsLoadingDialogue(false)
      }
    }

    void run()
  }, [selectedDialogue, loadDialogue, loadDialogueByDocumentId, loadDialogueFromRawJson, saveDialogue, validateGraph, toast])

  useEffect(() => {
    if (!routeTarget) return
    if (
      activeDialogueFilenameRef.current?.replace(/\.json$/i, '') ===
      routeTarget.normalizedDialogueId
    ) {
      return
    }

    const finalizeLoad = async (loadSeq: number) => {
      try {
        await validateGraph()
      } catch (err) {
        console.error('Erreur lors de la validation automatique au chargement:', err)
      }
      if (useGraphStore.getState().activeLoadSeq !== loadSeq) {
        loadInFlightRef.current = false
        setIsLoadingDialogue(false)
        return
      }
      loadInFlightRef.current = false
      setIsLoadingDialogue(false)
      const state = useGraphStore.getState()
      if (state.nodes.length > 0 && !state.selectedNodeId) {
        state.setSelectedNode(state.nodes[0].id)
      }
    }

    const loadFromRoute = async () => {
      if (loadInFlightRef.current && activeDialogueFilenameRef.current?.replace(/\.json$/i, '') === routeTarget.normalizedDialogueId) {
        return
      }
      resetGraph()
      const loadSeq = incrementLoadSeq()
      loadInFlightRef.current = true
      setIsLoadingDialogue(true)

      const docIdsToTry = /\.json$/i.test(routeTarget.decodedDialogueId)
        ? [routeTarget.normalizedDialogueId, routeTarget.decodedDialogueId]
        : [routeTarget.normalizedDialogueId, `${routeTarget.normalizedDialogueId}.json`]
      let loaded = false
      for (const documentId of docIdsToTry) {
        try {
          await loadDialogueByDocumentId(documentId)
          loaded = true
          break
        } catch {
          continue
        }
      }

      if (useGraphStore.getState().activeLoadSeq !== loadSeq) {
        loadInFlightRef.current = false
        setIsLoadingDialogue(false)
        return
      }

      if (!loaded) {
        const filename = /\.json$/i.test(routeTarget.decodedDialogueId)
          ? routeTarget.decodedDialogueId
          : `${routeTarget.normalizedDialogueId}.json`
        const response = await unityDialoguesAPI.getUnityDialogue(filename)
        
        if (useGraphStore.getState().activeLoadSeq !== loadSeq) {
          loadInFlightRef.current = false
          setIsLoadingDialogue(false)
          return
        }

        const stem = filename.replace(/\.json$/i, '') || filename
        await loadDialogueFromRawJson(response.json_content, stem)
      }

      if (useGraphStore.getState().activeLoadSeq !== loadSeq) {
        loadInFlightRef.current = false
        setIsLoadingDialogue(false)
        return
      }
      await finalizeLoad(loadSeq)
    }

    loadFromRoute()
      .catch((err) => {
        if (useGraphStore.getState().activeLoadSeq !== incrementLoadSeq()) return
        loadInFlightRef.current = false
        setIsLoadingDialogue(false)
        toast(getErrorMessage(err), 'error')
      })
  }, [routeTarget, loadDialogueByDocumentId, loadDialogueFromRawJson, validateGraph, toast])

  // Auto-save backend : micro-batch 50 ms (ADR-006, très fréquent pour ne pas perdre d’éditions au changement d’onglet)
  useEffect(() => {
    // On ne sauvegarde QUE si le dialogue sélectionné dans l'UI correspond au dialogue chargé dans le store.
    // Cela évite de sauvegarder les restes du dialogue A alors qu'on a déjà cliqué sur le dialogue B.
    const storeFilename = dialogueMetadata.filename || documentId || null
    const uiFilename = selectedDialogue?.filename || null

    const isSelectionChanging =
      !!uiFilename &&
      !!storeFilename &&
      normalizeDialogueFilenameKey(uiFilename) !== normalizeDialogueFilenameKey(storeFilename)

    if (
      !storeFilename ||
      isSelectionChanging ||
      !hasUnsavedChanges ||
      nodes.length === 0 ||
      isGraphLoading ||
      isGraphSaving ||
      isLoadingDialogue ||
      isGenerating
    ) {
      return
    }
    if (Date.now() < saveRetryBlockedUntilRef.current) return

    const timeoutId = setTimeout(() => {
      saveDialogue().catch((err) => {
        const status = (err as { response?: { status?: number } })?.response?.status
        if (typeof status === 'number' && status >= 400 && status < 500 && status !== 409) {
          saveRetryBlockedUntilRef.current = Date.now() + AUTOSAVE_4XX_BACKOFF_MS
        } else {
          saveRetryBlockedUntilRef.current = Date.now() + 3000
        }
        const errorMessage = getErrorMessage(err)
        const isNetworkError =
          errorMessage.includes('connexion au serveur') ||
          errorMessage.includes('connecter au serveur')
        const now = Date.now()
        const shouldShowToast =
          !isNetworkError ||
          !lastNetworkErrorRef.current ||
          lastNetworkErrorRef.current.message !== errorMessage ||
          now - lastNetworkErrorRef.current.timestamp > 10000
        if (shouldShowToast) {
          const displayMessage = isNetworkError
            ? 'Sauvegarde automatique suspendue (serveur inaccessible)'
            : `Sauvegarde automatique échouée: ${errorMessage}`
          toast(displayMessage, 'error', isNetworkError ? 5000 : undefined)
          if (isNetworkError) {
            lastNetworkErrorRef.current = { message: errorMessage, timestamp: now }
          }
        }
      })
    }, 50)
    return () => clearTimeout(timeoutId)
  }, [
    selectedDialogue,
    documentId,
    dialogueMetadata.filename,
    hasUnsavedChanges,
    isGraphLoading,
    isGraphSaving,
    isLoadingDialogue,
    isGenerating,
    nodes,
    saveDialogue,
    toast,
  ])

  const handleSave = useCallback(async () => {
    if (!activeDialogueFilename) {
      toast('Aucun dialogue sélectionné', 'warning')
      return
    }
    if (isLoadingDialogue) return

    try {
      setIsLoadingDialogue(true)
      window.dispatchEvent(new CustomEvent('flush-node-editor-form'))
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 1500)
        const onFlushed = () => {
          clearTimeout(timeout)
          resolve()
        }
        window.addEventListener('node-editor-flushed', onFlushed, { once: true })
      })
      const saveResponse = await saveDialogue()
      try {
        await validateGraph()
        const state = useGraphStore.getState()
        const errors = state.validationErrors.filter((e) => e.severity === 'error')
        const warnings = state.validationErrors.filter((e) => e.severity === 'warning')
        if (errors.length === 0 && warnings.length === 0) {
          toast(`Dialogue sauvegardé: ${saveResponse.filename} - Graphe valide`, 'success', 3000)
        } else if (errors.length > 0) {
          toast(
            `Dialogue sauvegardé: ${saveResponse.filename} - ${errors.length} erreur(s) et ${warnings.length} avertissement(s)`,
            'warning',
            4000
          )
        } else {
          toast(
            `Dialogue sauvegardé: ${saveResponse.filename} - ${warnings.length} avertissement(s)`,
            'warning',
            4000
          )
        }
      } catch (validationErr) {
        console.error('Erreur lors de la validation automatique:', validationErr)
        toast(`Dialogue sauvegardé: ${saveResponse.filename}`, 'success', 3000)
      }
      dialogueListRef.current?.refresh()
    } catch (err) {
      toast(`Erreur lors de la sauvegarde: ${getErrorMessage(err)}`, 'error')
    } finally {
      setIsLoadingDialogue(false)
    }
  }, [activeDialogueFilename, saveDialogue, validateGraph, toast])

  useEffect(() => {
    const onRequestSave = () => { void handleSave() }
    window.addEventListener('request-save-dialogue', onRequestSave)
    return () => window.removeEventListener('request-save-dialogue', onRequestSave)
  }, [handleSave])

  return {
    selectedDialogue,
    setSelectedDialogue,
    isLoadingDialogue,
    activeDialogueFilename,
    activeDialogueTitle,
    hasActiveDialogue,
    handleSave,
    dialogueListRef,
  }
}
