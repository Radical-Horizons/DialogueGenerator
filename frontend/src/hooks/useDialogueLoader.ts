/**
 * Gestion du chargement, de l'autosave et des events liés au cycle de vie d'un dialogue.
 * Extrait de GraphEditor pour isoler la logique de persistance du rendu.
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import type { RefObject } from 'react'
import { useGraphStore } from '../store/graphStore'
import { useGraphViewStore } from '../store/graphViewStore'
import { useGenerationStore } from '../store/generationStore'
import * as unityDialoguesAPI from '../api/unityDialogues'
import { getErrorMessage } from '../types/errors'
import { API_TIMEOUTS } from '../constants'
import type { UnityDialogueMetadata } from '../types/api'
import type { SaveGraphResponse } from '../types/graph'
import type { UnityDialogueListRef } from '../components/unityDialogues/UnityDialogueList'
import type { UseToastFn } from '../components/shared'
import { normalizeDialogueFilenameKey } from '../utils/formatDialogueTitle'
import { consumePendingValidationFocus } from '../utils/pendingValidationFocus'
import { DELETED_DIALOGUE_MESSAGE, isDeletedDocumentError } from '../store/slices/persistenceSlice'

interface RouteTarget {
  normalizedDialogueId: string
  decodedDialogueId: string
}

/** Délai avant de relancer une sauvegarde après une erreur passagère (réseau, 5xx, 409). */
const AUTOSAVE_TRANSIENT_RETRY_MS = 3000

const TRANSIENT_ERROR_CODES = new Set(['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT', 'ECONNREFUSED'])

const EDITION_SAVED_WHILE_DIRTY_WARNING =
  "Ce dialogue vient d'être enregistré depuis l'onglet Édition pendant une modification en cours dans le graphe : la version du graphe va le remplacer."

const MISSING_CHOICE_ID_INFO =
  'Choix sans identifiant stable — ouvert quand même. La prochaine sauvegarde les écrira.'

const REPLACED_NEWER_VERSION_INFO =
  "Ce dialogue avait été modifié ailleurs (onglet Édition ou autre onglet) : ces modifications ont été remplacées par celles du graphe, seul le titre a été conservé"

type ApiErrorShape = {
  response?: { status?: number; data?: { error?: { code?: string } } }
}

function isNotFoundError(error: unknown): boolean {
  return (error as ApiErrorShape)?.response?.status === 404
}

function isMissingChoiceIdError(error: unknown): boolean {
  const response = (error as ApiErrorShape)?.response
  const status = response?.status
  return (
    (status === 422 || status === 400) &&
    response?.data?.error?.code === 'missing_choice_id'
  )
}

/**
 * Réseau, 5xx, 409, 408, 429 : relancer après un délai a un sens. Un 4xx de validation ou de
 * droits, ou une erreur locale, se reproduira à l'identique : on attend la prochaine modification.
 */
function isTransientSaveError(error: unknown): boolean {
  const status = (error as ApiErrorShape)?.response?.status
  if (typeof status === 'number') {
    return status >= 500 || status === 409 || status === 408 || status === 429
  }
  const code = (error as { code?: unknown })?.code
  return error instanceof TypeError || (typeof code === 'string' && TRANSIENT_ERROR_CODES.has(code))
}

function shouldFallbackToUnityRaw(error: unknown): boolean {
  return isNotFoundError(error) || isMissingChoiceIdError(error)
}

async function tryLoadCanonicalDocuments(
  docIdsToTry: string[],
  loadDialogueByDocumentId: (documentId: string) => Promise<void>,
): Promise<{ loaded: boolean; missingChoiceId: boolean }> {
  let missingChoiceId = false
  for (const documentId of docIdsToTry) {
    try {
      await loadDialogueByDocumentId(documentId)
      return { loaded: true, missingChoiceId: false }
    } catch (error) {
      if (isMissingChoiceIdError(error)) {
        missingChoiceId = true
        continue
      }
      if (!shouldFallbackToUnityRaw(error)) throw error
    }
  }
  return { loaded: false, missingChoiceId }
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
  /** Valeur courante pour handleSave (évite no-op si le state React n’est pas encore rafraîchi). */
  const isLoadingDialogueRef = useRef(isLoadingDialogue)
  isLoadingDialogueRef.current = isLoadingDialogue

  const dialogueListRef = useRef<UnityDialogueListRef>(null)
  const prevSelectedDialogueRef = useRef<UnityDialogueMetadata | null>(null)
  const loadInFlightRef = useRef(false)
  const activeDialogueFilenameRef = useRef<string | null>(null)
  const lastNetworkErrorRef = useRef<{ message: string; timestamp: number } | null>(null)
  const saveRetryBlockedUntilRef = useRef<number>(0)
  /** Échec non passager : pas de relance avant une nouvelle modification de ce dialogue. */
  const failedSaveRef = useRef<{ documentId: string; clientSeq: number } | null>(null)
  const [autosaveRetryTick, setAutosaveRetryTick] = useState(0)

  const {
    nodes,
    clientSeq,
    dialogueMetadata,
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

  const resetGraphAndTemplateSession = useCallback(() => {
    resetGraph()
    useGenerationStore.getState().clearTemplateSession()
  }, [resetGraph])

  const notifySaveOutcome = useCallback(
    (response: SaveGraphResponse | undefined) => {
      if (response?.replacedNewerVersion) toast(REPLACED_NEWER_VERSION_INFO, 'info')
    },
    [toast],
  )

  /** Enregistre le dialogue ouvert avant d'en charger un autre ; `false` si l'enregistrement a échoué. */
  const saveBeforeLeaving = useCallback(async (): Promise<boolean> => {
    useGraphViewStore.getState().requestFlush()
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 0)
    })
    const state = useGraphStore.getState()
    const currentFilename = state.dialogueMetadata?.filename ?? state.documentId ?? null
    if (!state.hasUnsavedChanges || !currentFilename) return true
    try {
      notifySaveOutcome(await saveDialogue())
      return true
    } catch (err) {
      console.error('Erreur sauvegarde avant chargement:', err)
      toast(`Impossible de sauvegarder avant changement: ${getErrorMessage(err)}`, 'error')
      return false
    }
  }, [saveDialogue, notifySaveOutcome, toast])

  // Ne pas utiliser ?? seul : une chaîne vide sur selectedDialogue bloquait le repli documentId (E2E / liste).
  const activeDialogueFilename =
    selectedDialogue?.filename?.trim() ||
    dialogueMetadata.filename?.trim() ||
    documentId?.trim() ||
    null
  const activeDialogueTitle = selectedDialogue?.title ?? dialogueMetadata.title
  const hasActiveDialogue = !!activeDialogueFilename || nodes.length > 0

  useEffect(() => {
    activeDialogueFilenameRef.current = activeDialogueFilename
  }, [activeDialogueFilename])

  const dialogueDeleted = useGraphViewStore((s) => s.dialogueDeleted)
  useEffect(() => {
    if (!dialogueDeleted) return
    useGraphViewStore.getState().clearDialogueDeleted()
    dialogueListRef.current?.refresh()
    const state = useGraphStore.getState()
    const loaded = state.dialogueMetadata?.filename ?? state.documentId ?? null
    const deletedKey = normalizeDialogueFilenameKey(dialogueDeleted)
    const isSelected =
      !!selectedDialogue?.filename &&
      normalizeDialogueFilenameKey(selectedDialogue.filename) === deletedKey
    if (isSelected || (!!loaded && normalizeDialogueFilenameKey(loaded) === deletedKey)) {
      setSelectedDialogue(null)
      resetGraphAndTemplateSession()
    }
  }, [dialogueDeleted, selectedDialogue?.filename, resetGraphAndTemplateSession])

  const documentSaved = useGraphViewStore((s) => s.documentSaved)
  useEffect(() => {
    if (!documentSaved || documentSaved.source !== 'edition') return
    const state = useGraphStore.getState()
    const loadedId = state.documentId ?? state.dialogueMetadata?.filename ?? null
    if (
      !loadedId ||
      normalizeDialogueFilenameKey(loadedId) !== normalizeDialogueFilenameKey(documentSaved.documentId) ||
      (state.documentRevision ?? 0) >= documentSaved.revision
    ) {
      return
    }
    if (state.hasUnsavedChanges || state.isSaving || state.isGenerating || state.isLoading) {
      toast(EDITION_SAVED_WHILE_DIRTY_WARNING, 'warning', 8000)
      return
    }
    const selectedNodeId = state.selectedNodeId
    const loadSeq = incrementLoadSeq()
    void (async () => {
      try {
        await loadDialogueByDocumentId(loadedId)
      } catch (err) {
        if (useGraphStore.getState().activeLoadSeq === loadSeq) {
          toast(`Rechargement du dialogue impossible: ${getErrorMessage(err)}`, 'error')
        }
        return
      }
      const next = useGraphStore.getState()
      if (next.activeLoadSeq !== loadSeq) return
      if (selectedNodeId && next.nodes.some((node) => node.id === selectedNodeId)) {
        next.setSelectedNode(selectedNodeId)
      }
      try {
        await validateGraph()
      } catch (err) {
        console.error('Erreur lors de la validation après rechargement:', err)
      }
    })()
  }, [documentSaved, incrementLoadSeq, loadDialogueByDocumentId, validateGraph, toast])

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
      const previousSelection = prevSelectedDialogueRef.current
      prevSelectedDialogueRef.current = selectedDialogue

      const state = useGraphStore.getState()
      const currentFilename = state.dialogueMetadata?.filename ?? state.documentId ?? null
      const isSameDialogue =
        !!currentFilename &&
        !!targetFilename &&
        normalizeDialogueFilenameKey(currentFilename) === normalizeDialogueFilenameKey(targetFilename)

      if (isSameDialogue) {
        setIsLoadingDialogue(false)
        loadInFlightRef.current = false
        return
      }

      if (!(await saveBeforeLeaving())) {
        loadInFlightRef.current = false
        setIsLoadingDialogue(false)
        // Le graphe montre toujours l'ancien dialogue : la sélection doit le dire aussi.
        prevSelectedDialogueRef.current = previousSelection
        setSelectedDialogue(previousSelection)
        return
      }

      const loadSeq = incrementLoadSeq()

      try {
        const docIdsToTry = /\.json$/i.test(targetFilename)
          ? [targetFilename.replace(/\.json$/i, ''), targetFilename]
          : [targetFilename, `${targetFilename}.json`]
        const { loaded, missingChoiceId } = await tryLoadCanonicalDocuments(
          docIdsToTry,
          loadDialogueByDocumentId,
        )

        if (useGraphStore.getState().activeLoadSeq !== loadSeq) {
          loadInFlightRef.current = false
          setIsLoadingDialogue(false)
          return
        }

        if (!loaded) {
          const response = await unityDialoguesAPI.getUnityDialogue(targetFilename)
          if (useGraphStore.getState().activeLoadSeq !== loadSeq) {
            loadInFlightRef.current = false
            setIsLoadingDialogue(false)
            return
          }

          const stem = /\.json$/i.test(targetFilename) ? targetFilename.replace(/\.json$/i, '') : targetFilename
          await loadDialogueFromRawJson(response.json_content, stem || targetFilename)
        }

        if (useGraphStore.getState().activeLoadSeq !== loadSeq) {
          loadInFlightRef.current = false
          setIsLoadingDialogue(false)
          return
        }

        useGenerationStore.getState().clearTemplateSession()
        if (missingChoiceId && !loaded) {
          toast(MISSING_CHOICE_ID_INFO, 'info')
        }

        try {
          await validateGraph()
        } catch (err) {
          console.error('Erreur lors de la validation automatique au chargement:', err)
        }
        const focusNodeId = consumePendingValidationFocus()
        if (focusNodeId) {
          useGraphStore.getState().jumpToNode(focusNodeId)
        }
        loadInFlightRef.current = false
        setIsLoadingDialogue(false)
        const nextState = useGraphStore.getState()
        if (nextState.nodes.length > 0 && !nextState.selectedNodeId) {
          nextState.setSelectedNode(nextState.nodes[0].id)
        }
      } catch (err) {
        if (useGraphStore.getState().activeLoadSeq !== loadSeq) {
          loadInFlightRef.current = false
          setIsLoadingDialogue(false)
          return
        }
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
  }, [
    selectedDialogue,
    loadDialogueByDocumentId,
    loadDialogueFromRawJson,
    saveBeforeLeaving,
    validateGraph,
    toast,
    incrementLoadSeq,
  ])

  const continuationRequest = useGraphViewStore((s) => s.continuationRequest)
  const dispatchedContinuationRef = useRef<typeof continuationRequest>(null)
  useEffect(() => {
    if (!continuationRequest) {
      dispatchedContinuationRef.current = null
      return
    }
    const wanted = normalizeDialogueFilenameKey(continuationRequest.filename)
    if (dispatchedContinuationRef.current !== continuationRequest) {
      dispatchedContinuationRef.current = continuationRequest
      const state = useGraphStore.getState()
      const loaded = state.dialogueMetadata?.filename ?? state.documentId ?? null
      // Éditer vient d'écrire ce dialogue : la copie déjà chargée dans le graphe est périmée.
      if (loaded && normalizeDialogueFilenameKey(loaded) === wanted && !state.hasUnsavedChanges) {
        resetGraph()
      }
      setSelectedDialogue({
        filename: continuationRequest.filename,
        file_path: '',
        size_bytes: 0,
        modified_time: new Date().toISOString(),
      })
      return
    }
    const loaded = dialogueMetadata.filename || documentId
    if (
      isLoadingDialogue ||
      isGraphLoading ||
      !loaded ||
      normalizeDialogueFilenameKey(loaded) !== wanted
    ) {
      return
    }
    const view = useGraphViewStore.getState()
    view.clearContinuationRequest()
    view.openAIGeneration(continuationRequest.nodeId)
    view.focusNode(continuationRequest.nodeId)
  }, [
    continuationRequest,
    selectedDialogue,
    isLoadingDialogue,
    isGraphLoading,
    dialogueMetadata.filename,
    documentId,
    resetGraph,
  ])

  useEffect(() => {
    // Ni sauvegarde manuelle ni avertissement (principe produit) : en quittant la page,
    // les PUT partent en `keepalive` pour survivre au déchargement, que le navigateur
    // annulerait sinon.
    const persistWithKeepalive = () => {
      const state = useGraphStore.getState()
      if (state.hasUnsavedChanges && !state.isLoading && !state.isGenerating) {
        void saveDialogue({ keepalive: true }).catch((error) => {
          console.error('Sauvegarde automatique de cycle de vie:', error)
        })
      }
    }
    // La page se décharge : un minuteur risquerait de ne jamais s'exécuter.
    const handlePageHide = () => {
      useGraphViewStore.getState().requestFlush()
      persistWithKeepalive()
    }
    // Onglet masqué mais vivant : on laisse au panneau nœud un tick pour vider son formulaire.
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return
      useGraphViewStore.getState().requestFlush()
      window.setTimeout(persistWithKeepalive, 0)
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePageHide)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [saveDialogue])

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
      loadInFlightRef.current = true
      setIsLoadingDialogue(true)
      if (!(await saveBeforeLeaving())) {
        loadInFlightRef.current = false
        setIsLoadingDialogue(false)
        const graph = useGraphStore.getState()
        const displayed = graph.dialogueMetadata?.filename || graph.documentId
        if (displayed) useGraphViewStore.getState().requestRouteDialogueRevert(displayed)
        return
      }
      const loadSeq = incrementLoadSeq()

      try {
        const docIdsToTry = /\.json$/i.test(routeTarget.decodedDialogueId)
          ? [routeTarget.normalizedDialogueId, routeTarget.decodedDialogueId]
          : [routeTarget.normalizedDialogueId, `${routeTarget.normalizedDialogueId}.json`]
        const { loaded, missingChoiceId } = await tryLoadCanonicalDocuments(
          docIdsToTry,
          loadDialogueByDocumentId,
        )

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
        useGenerationStore.getState().clearTemplateSession()
        if (missingChoiceId && !loaded) {
          toast(MISSING_CHOICE_ID_INFO, 'info')
        }
        await finalizeLoad(loadSeq)
      } catch (err) {
        if (useGraphStore.getState().activeLoadSeq !== loadSeq) {
          loadInFlightRef.current = false
          setIsLoadingDialogue(false)
          return
        }
        loadInFlightRef.current = false
        setIsLoadingDialogue(false)
        toast(getErrorMessage(err), 'error')
      }
    }

    void loadFromRoute()
  }, [
    routeTarget,
    loadDialogueByDocumentId,
    loadDialogueFromRawJson,
    saveBeforeLeaving,
    validateGraph,
    toast,
    incrementLoadSeq,
  ])

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
    const failedSave = failedSaveRef.current
    if (failedSave && failedSave.documentId === storeFilename && failedSave.clientSeq === clientSeq) {
      return
    }
    const blockedForMs = saveRetryBlockedUntilRef.current - Date.now()
    if (blockedForMs > 0) {
      const retryId = setTimeout(() => setAutosaveRetryTick((tick) => tick + 1), blockedForMs)
      return () => clearTimeout(retryId)
    }

    const timeoutId = setTimeout(() => {
      const attemptedSeq = useGraphStore.getState().clientSeq
      saveDialogue().then((response) => {
        failedSaveRef.current = null
        notifySaveOutcome(response)
      }).catch((err) => {
        if (isTransientSaveError(err)) {
          failedSaveRef.current = null
          saveRetryBlockedUntilRef.current = Date.now() + AUTOSAVE_TRANSIENT_RETRY_MS
        } else {
          failedSaveRef.current = { documentId: storeFilename, clientSeq: attemptedSeq }
        }
        setAutosaveRetryTick((tick) => tick + 1)
        if (isDeletedDocumentError(err)) {
          toast(DELETED_DIALOGUE_MESSAGE, 'error')
          return
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
    nodes.length,
    clientSeq,
    autosaveRetryTick,
    saveDialogue,
    notifySaveOutcome,
    toast,
  ])

  const handleSave = useCallback(async () => {
    if (!activeDialogueFilename) {
      toast('Aucun dialogue sélectionné', 'warning')
      return
    }
    // Attendre la fin du chargement (ex. E2E : Ctrl+S / requestSave juste après ouverture dialogue).
    const loadDeadline = Date.now() + 8000
    while (isLoadingDialogueRef.current && Date.now() < loadDeadline) {
      await new Promise<void>((r) => {
        window.setTimeout(r, 100)
      })
    }
    if (isLoadingDialogueRef.current) {
      toast('Chargement du dialogue en cours — réessayez dans un instant', 'warning')
      return
    }

    // Laisser finir une sauvegarde API en cours (autosave ou `API_TIMEOUTS.DOCUMENT_IO`) avant Ctrl+S / E2E requestSave.
    const savingDeadline = Date.now() + API_TIMEOUTS.DOCUMENT_IO + 15_000
    while (useGraphStore.getState().isSaving && Date.now() < savingDeadline) {
      await new Promise<void>((r) => {
        window.setTimeout(r, 100)
      })
    }
    if (useGraphStore.getState().isSaving) {
      toast('Sauvegarde déjà en cours — réessayez dans un instant', 'warning')
      return
    }

    try {
      setIsLoadingDialogue(true)
      useGraphViewStore.getState().requestFlush()
      // Laisser un tick au navigateur pour que NodeEditorPanel (useEffect flush) s’exécute avant l’abonnement Zustand.
      await new Promise<void>((r) => {
        window.setTimeout(r, 0)
      })
      try {
        await new Promise<void>((resolve, reject) => {
          const FLUSH_WAIT_MS = 5000
          let settled = false
          const timeout = window.setTimeout(() => {
            if (settled) return
            settled = true
            unsub()
            reject(new Error('Flush timeout: éditeur non synchronisé'))
          }, FLUSH_WAIT_MS)
          const unsub = useGraphViewStore.subscribe((state) => {
            if (state.flushCompleted && !settled) {
              settled = true
              window.clearTimeout(timeout)
              unsub()
              resolve()
            }
          })
        })
      } catch (flushErr) {
        // ConnectionTargetSelect / edgeSlice mettent déjà à jour le store ; sans ce repli,
        // Ctrl+S peut ne rien persister si le panneau nœud ne confirme pas le flush (E2E Dashboard).
        console.warn('Flush éditeur incomplet, sauvegarde du graphe courant:', flushErr)
      }
      useGraphViewStore.getState().resetFlush()
      const saveResponse = await saveDialogue()
      notifySaveOutcome(saveResponse)
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
      dialogueListRef.current?.refresh()
    } catch (err) {
      useGraphViewStore.getState().resetFlush()
      const fieldErrorCount = useGraphStore.getState().documentFieldErrors.length
      if (fieldErrorCount === 0) {
        toast(`Erreur lors de la sauvegarde: ${getErrorMessage(err)}`, 'error')
      }
    } finally {
      setIsLoadingDialogue(false)
    }
  }, [activeDialogueFilename, saveDialogue, notifySaveOutcome, toast])

  const saveRequested = useGraphViewStore((s) => s.saveRequested)
  useEffect(() => {
    if (!saveRequested) return
    useGraphViewStore.getState().clearSaveRequest()
    void handleSave()
  }, [saveRequested, handleSave])

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
