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

interface UseToastFn {
  (message: string, variant?: string, duration?: number): void
}

interface RouteTarget {
  normalizedDialogueId: string
  decodedDialogueId: string
}

/** Circuit breaker: backoff après 4xx non-409 pour éviter la boucle d'autosave. */
const AUTOSAVE_4XX_BACKOFF_MS = 10_000

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
  const routeLoadSeqRef = useRef(0)
  const activeDialogueFilenameRef = useRef<string | null>(null)
  const lastNetworkErrorRef = useRef<{ message: string; timestamp: number } | null>(null)
  const saveRetryBlockedUntilRef = useRef<number>(0)

  const {
    nodes,
    dialogueMetadata,
    loadDialogue,
    loadDialogueByDocumentId,
    saveDialogue,
    validateGraph,
    hasUnsavedChanges,
    isLoading: isGraphLoading,
    isSaving: isGraphSaving,
    isGenerating,
    resetGraph,
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
    if (selectedDialogue) {
      prevSelectedDialogueRef.current = selectedDialogue
      loadInFlightRef.current = true
      setIsLoadingDialogue(true)
      unityDialoguesAPI.getUnityDialogue(selectedDialogue.filename)
        .then((response) => loadDialogue(response.json_content, undefined, selectedDialogue.filename))
        .then(async () => {
          try {
            await validateGraph()
          } catch (err) {
            console.error('Erreur lors de la validation automatique au chargement:', err)
          }
          loadInFlightRef.current = false
          setIsLoadingDialogue(false)
          const state = useGraphStore.getState()
          if (state.nodes.length > 0 && !state.selectedNodeId) {
            state.setSelectedNode(state.nodes[0].id)
          }
        })
        .catch((err) => {
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
        })
    } else {
      prevSelectedDialogueRef.current = null
    }
  }, [selectedDialogue, loadDialogue, validateGraph, toast])

  useEffect(() => {
    if (!routeTarget) return
    if (
      activeDialogueFilenameRef.current?.replace(/\.json$/i, '') ===
      routeTarget.normalizedDialogueId
    ) {
      return
    }

    const loadSeq = ++routeLoadSeqRef.current
    loadInFlightRef.current = true
    setIsLoadingDialogue(true)

    const finalizeLoad = async () => {
      try {
        await validateGraph()
      } catch (err) {
        console.error('Erreur lors de la validation automatique au chargement:', err)
      }
      if (routeLoadSeqRef.current !== loadSeq) return
      loadInFlightRef.current = false
      setIsLoadingDialogue(false)
      const state = useGraphStore.getState()
      if (state.nodes.length > 0 && !state.selectedNodeId) {
        state.setSelectedNode(state.nodes[0].id)
      }
    }

    const loadFromRoute = async () => {
      if (/\.json$/i.test(routeTarget.decodedDialogueId)) {
        const response = await unityDialoguesAPI.getUnityDialogue(routeTarget.decodedDialogueId)
        let parsed: unknown = null
        try {
          parsed = JSON.parse(response.json_content)
        } catch {
          parsed = null
        }
        const isCanonicalDocument =
          !!parsed &&
          typeof parsed === 'object' &&
          !Array.isArray(parsed) &&
          Array.isArray((parsed as { nodes?: unknown[] }).nodes)
        if (isCanonicalDocument) {
          await loadDialogueByDocumentId(routeTarget.normalizedDialogueId)
          return
        }
        await loadDialogue(response.json_content, undefined, routeTarget.decodedDialogueId)
        return
      }
      try {
        await loadDialogueByDocumentId(routeTarget.normalizedDialogueId)
      } catch (err) {
        try {
          const canonicalLegacyId = `${routeTarget.normalizedDialogueId}.json`
          await loadDialogueByDocumentId(canonicalLegacyId)
        } catch {
          const legacyFilename = `${routeTarget.normalizedDialogueId}.json`
          try {
            const response = await unityDialoguesAPI.getUnityDialogue(legacyFilename)
            await loadDialogue(response.json_content, undefined, legacyFilename)
          } catch {
            throw err
          }
        }
      }
    }

    loadFromRoute()
      .then(() => finalizeLoad())
      .catch((err) => {
        if (routeLoadSeqRef.current !== loadSeq) return
        loadInFlightRef.current = false
        setIsLoadingDialogue(false)
        toast(getErrorMessage(err), 'error')
      })
  }, [routeTarget, loadDialogue, loadDialogueByDocumentId, validateGraph, toast])

  // Auto-save backend : micro-batch 100 ms (ADR-006)
  useEffect(() => {
    if (
      !activeDialogueFilename ||
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
    }, 100)
    return () => clearTimeout(timeoutId)
  }, [
    activeDialogueFilename,
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
