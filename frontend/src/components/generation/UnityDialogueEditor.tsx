/**
 * Éditeur Unity JSON pour dialogues (édition partielle + round-trip).
 * Permet d'éditer speaker, line, choices[].text, choices[].targetNode.
 * Préserve tous les autres champs en lecture seule.
 *
 * Un dialogue existant (`filename`) se sauvegarde seul : pause de saisie, renommage,
 * démontage (changement de dialogue ou de section) et déchargement de la page.
 * Sans `filename` (résultat de génération pas encore gardé), rien n'est écrit tant
 * que le parent n'appelle pas `handleSave` : garder un résultat est une décision.
 */
import { memo, useState, useEffect, useCallback, useMemo, useImperativeHandle, forwardRef, useRef, type ReactNode } from 'react'
import * as documentsAPI from '../../api/documents'
import * as dialoguesAPI from '../../api/dialogues'
import { getErrorMessage } from '../../types/errors'
import { theme } from '../../theme'
import { unityDialogueEditorChrome } from '../../theme/responsiveChrome'
import { mechanicalFormClass } from '../../theme/fieldTokens'
import { useToast } from '../shared'
import { InlineFieldError, fieldErrorBorder } from '../shared/InlineFieldError'
import { AttributeSkillTestEditor } from '../graph/AttributeSkillTestEditor'
import { TraitRequirementsEditor } from '../shared/TraitRequirementsEditor'
import { useDialogueEditionNarrow } from '../unityDialogues/DialogueEditionNarrowContext'
import { useAuthStore } from '../../store/authStore'
import {
  EditableDialogueTitle,
  EditorSaveStatusLabel,
  ReadOnlyNotice,
  UnityDialogueEditorActionsBar,
} from './UnityDialogueEditorToolbar'
import {
  AUTOSAVE_DEBOUNCE_MS,
  pickContinuationNodeId,
  type EditorSaveState,
  type UnityDialogueEditorAction,
} from './UnityDialogueEditorLogic'
import type {
  UnityDialogueNode,
  UnityDialogueChoice,
} from '../../types/api'
import {
  extractValidationIssuesFromApiError,
  type DocumentFieldError,
} from '../../utils/documentValidationFieldErrors'
import {
  documentIdFromTitle,
  documentIdWithNumericSuffix,
  isCanonicalRevisionConflict,
} from '../../utils/documentIdFromTitle'

export interface UnityDialogueEditorProps {
  json_content: string
  title?: string
  subtitle?: string
  filename?: string
  document?: Record<string, unknown>
  documentRevision?: number
  canEdit?: boolean
  onSave?: (filename: string, revision: number) => void | Promise<void>
  /**
   * Notifié à chaque édition locale (JSON Unity array stringifié).
   * Permet de synchroniser le graphStore avant une sauvegarde graphe (1ʳᵉ génération).
   */
  onContentChange?: (jsonContent: string) => void
  /** Miroir isValid / isSaving pour le bouton « Garder et continuer » du Dashboard. */
  onSaveStateChange?: (state: { isValid: boolean; isSaving: boolean }) => void
  /** Actions de la barre, dans l'ordre de priorité : ce qui ne tient pas passe dans « Autres ». */
  actions?: UnityDialogueEditorAction[]
  /**
   * Ajoute « Générer la suite » : reçoit le nœud d'où repartir, une fois les
   * modifications en cours enregistrées.
   */
  onGenerateContinuation?: (nodeId: string) => void
  /** Notifié après l'enregistrement d'un nouveau titre (`document.title`). */
  onRenamed?: (title: string) => void
  /**
   * Slot optionnel placé dans la zone titre du header (Story 17.7).
   * Utilisé en mode narrow pour héberger un sélecteur de dialogue (`DialogueCombobox`)
   * — le mode desktop conserve la liste latérale et n'utilise pas ce slot.
   */
  headerSelector?: ReactNode
  /**
   * Story 8.8 : après ouverture depuis un rapport de validation batch,
   * scroll + focus le nœud concerné (deep-link léger).
   */
  focusNodeId?: string
}

export interface UnityDialogueEditorHandle {
  handleSave: () => Promise<void>
  /** Enregistre tout de suite ce qui attend la fin de la pause de saisie. */
  flushSave: () => Promise<void>
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
  document,
  documentRevision = 1,
  canEdit = true,
  onSave,
  onContentChange,
  onSaveStateChange,
  actions,
  onGenerateContinuation,
  onRenamed,
  headerSelector,
  focusNodeId,
}, ref) {
  const toast = useToast()
  const isNarrow = useDialogueEditionNarrow()
  const chrome = isNarrow ? unityDialogueEditorChrome.narrow : unityDialogueEditorChrome.comfortable
  const isGuest = useAuthStore((s) => s.user?.role === 'guest')
  const documentId = filename?.replace(/\.json$/i, '') || null
  const readOnly = !canEdit
  const autoSaveEnabled = Boolean(documentId) && canEdit
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<DocumentFieldError[]>([])
  const [expandedAdvanced, setExpandedAdvanced] = useState<Set<string>>(new Set())
  const [saveState, setSaveState] = useState<EditorSaveState>({
    status: 'idle',
    lastSavedAt: null,
    error: null,
  })
  const [displayTitle, setDisplayTitle] = useState(title)
  const revisionRef = useRef(documentRevision)
  const onContentChangeRef = useRef(onContentChange)
  onContentChangeRef.current = onContentChange
  const onSaveStateChangeRef = useRef(onSaveStateChange)
  onSaveStateChangeRef.current = onSaveStateChange
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave
  const onRenamedRef = useRef(onRenamed)
  onRenamedRef.current = onRenamed
  const documentRef = useRef(document)
  documentRef.current = document
  const documentIdRef = useRef(documentId)
  documentIdRef.current = documentId
  const autoSaveEnabledRef = useRef(autoSaveEnabled)
  autoSaveEnabledRef.current = autoSaveEnabled
  const toastRef = useRef(toast)
  toastRef.current = toast
  /** Édition locale pas encore écrite sur le serveur. */
  const dirtyRef = useRef(false)
  const renamedTitleRef = useRef<string | null>(null)
  const lastEditedNodeIdRef = useRef<string | null>(null)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlightSaveRef = useRef<Promise<void> | null>(null)
  const mountedRef = useRef(true)
  const lastErrorToastRef = useRef<string | null>(null)

  useEffect(() => {
    setDisplayTitle(title)
  }, [title])

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
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes

  const commitNodes = useCallback((nextNodes: UnityDialogueNode[], editedNodeId: string) => {
    nodesRef.current = nextNodes
    dirtyRef.current = true
    lastEditedNodeIdRef.current = editedNodeId
    onContentChangeRef.current?.(JSON.stringify(nextNodes))
  }, [])

  // Mettre à jour les nœuds quand json_content change
  useEffect(() => {
    try {
      const parsed = JSON.parse(json_content)
      if (!Array.isArray(parsed)) {
        throw new Error('Le JSON Unity doit être un tableau de nœuds')
      }
      // Évite d'écraser les edits locales quand le parent echo le même contenu.
      if (JSON.stringify(nodesRef.current) === JSON.stringify(parsed)) {
        return
      }
      setNodes(parsed as UnityDialogueNode[])
      setError(null)
      setFieldErrors([])
    } catch (error) {
      console.error('Erreur lors du parsing du JSON Unity:', error)
      setNodes([])
      setError('Erreur lors du parsing du JSON Unity')
    }
  }, [json_content])

  useEffect(() => {
    revisionRef.current = Math.max(revisionRef.current, documentRevision)
  }, [documentRevision])

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

  useEffect(() => {
    onSaveStateChangeRef.current?.({ isValid, isSaving })
  }, [isValid, isSaving])

  // Mettre à jour un nœud (par ID, pas par index)
  const updateNode = useCallback((nodeId: string, updates: Partial<UnityDialogueNode>) => {
    setNodes((prev) => {
      const next = prev.map((node) => (node.id === nodeId ? { ...node, ...updates } : node))
      commitNodes(next, nodeId)
      return next
    })
  }, [commitNodes])

  const firstFieldError = fieldErrors[0]
  const contentRef = useRef<HTMLDivElement>(null)
  const appliedFocusNodeRef = useRef<string | null>(null)

  useEffect(() => {
    if (!firstFieldError) return
    const root = contentRef.current
    if (!root) return
    const el = root.querySelector(
      `[data-validation-field="${firstFieldError.nodeId}::${firstFieldError.field}"]`,
    )
    if (!(el instanceof HTMLElement)) return
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    el.querySelector<HTMLElement>('input')?.focus()
  }, [firstFieldError])

  useEffect(() => {
    if (!focusNodeId) {
      appliedFocusNodeRef.current = null
      return
    }
    if (appliedFocusNodeRef.current === focusNodeId) return
    const root = contentRef.current
    if (!root) return
    const el = root.querySelector(
      `[data-dialogue-node-id="${CSS.escape(focusNodeId)}"]`
    )
    if (!(el instanceof HTMLElement)) return
    appliedFocusNodeRef.current = focusNodeId
    el.scrollIntoView({ block: 'start', behavior: 'smooth' })
    const focusable =
      el.querySelector<HTMLElement>('textarea, input, select, button') ?? el
    focusable.focus()
  }, [focusNodeId, json_content])

  const fieldErrorByKey = useMemo(() => {
    const map = new Map<string, string>()
    for (const error of fieldErrors) {
      map.set(`${error.nodeId}::${error.field}`, error.message)
    }
    return map
  }, [fieldErrors])

  const getFieldError = useCallback(
    (nodeId: string, field: string): string | undefined => {
      return fieldErrorByKey.get(`${nodeId}::${field}`)
    },
    [fieldErrorByKey],
  )

  const clearFieldError = useCallback((nodeId: string, field: string) => {
    setFieldErrors((prev) => prev.filter((e) => !(e.nodeId === nodeId && e.field === field)))
  }, [])

  const updateConsequences = useCallback(
    (nodeId: string, updates: { flag?: string; description?: string }) => {
      clearFieldError(nodeId, 'consequences.flag')
      clearFieldError(nodeId, 'consequences.description')
      setNodes((prev) => {
        const next = prev.map((node) => {
          if (node.id !== nodeId) return node
          const cons = { ...(node.consequences ?? { flag: '' }), ...updates }
          return { ...node, consequences: cons }
        })
        commitNodes(next, nodeId)
        return next
      })
      },
    [clearFieldError, commitNodes],
  )

  // Mettre à jour le speaker d'un nœud
  const updateNodeSpeaker = useCallback(
    (nodeId: string, speaker: string) => {
      clearFieldError(nodeId, 'speaker')
      updateNode(nodeId, { speaker: speaker.trim() || undefined })
    },
    [updateNode, clearFieldError]
  )

  // Mettre à jour le line d'un nœud
  const updateNodeLine = useCallback(
    (nodeId: string, line: string) => {
      clearFieldError(nodeId, 'line')
      // Ne pas trim() le texte entier : les retours à la ligne en fin de bloc sont éditables.
      updateNode(nodeId, { line: line.trim() === '' ? undefined : line })
    },
    [updateNode, clearFieldError]
  )

  // Mettre à jour un choix (par nodeId, pas par index)
  const updateChoice = useCallback(
    (nodeId: string, choiceIndex: number, updates: Partial<UnityDialogueChoice>) => {
      for (const key of Object.keys(updates)) {
        clearFieldError(nodeId, `choices.${choiceIndex}.${key}`)
      }
      setNodes((prev) => {
        const next = prev.map((node) => {
          if (node.id !== nodeId) return node
          const choices = [...(node.choices || [])]
          choices[choiceIndex] = { ...choices[choiceIndex], ...updates }
          return { ...node, choices }
        })
        commitNodes(next, nodeId)
        return next
      })
      },
    [clearFieldError, commitNodes],
  )

  // Ajouter un choix (par nodeId, pas par index)
  const addChoice = useCallback(
    (nodeId: string) => {
      setNodes((prev) => {
        const next = prev.map((node) => {
          if (node.id !== nodeId) return node
          const choices = [...(node.choices || [])]
          choices.push({ text: '', targetNode: 'END' })
          return { ...node, choices }
        })
        commitNodes(next, nodeId)
        return next
      })
      },
    [commitNodes]
  )

  // Supprimer un choix (par nodeId, pas par index)
  const removeChoice = useCallback((nodeId: string, choiceIndex: number) => {
    setNodes((prev) => {
      const next = prev.map((node) => {
        if (node.id !== nodeId) return node
        const choices = [...(node.choices || [])]
        choices.splice(choiceIndex, 1)
        return { ...node, choices: choices.length > 0 ? choices : undefined }
      })
      commitNodes(next, nodeId)
      return next
    })
  }, [commitNodes])

  const isValidRef = useRef(isValid)
  isValidRef.current = isValid

  const reportSaveError = useCallback((err: unknown, nodesSent: UnityDialogueNode[], silent: boolean) => {
    const { fieldErrors: extracted } = extractValidationIssuesFromApiError(err, nodesSent)
    const errorMessage = getErrorMessage(err)
    if (!mountedRef.current) return
    if (extracted.length > 0) {
      setFieldErrors(extracted)
      setError(null)
    } else {
      setError(errorMessage)
      if (!silent || lastErrorToastRef.current !== errorMessage) {
        toastRef.current(`Erreur lors de la sauvegarde: ${errorMessage}`, 'error')
      }
      lastErrorToastRef.current = errorMessage
    }
    setSaveState((prev) => ({ ...prev, status: 'error', error: errorMessage }))
  }, [])

  /**
   * PUT du document existant, avec la validation export partagée par le graphe.
   * `keepalive` : requête qui survit au déchargement de la page.
   */
  const saveExistingDocument = useCallback(
    async ({ silent, keepalive = false }: { silent: boolean; keepalive?: boolean }): Promise<void> => {
      const targetId = documentIdRef.current
      if (!targetId) return
      if (!isValidRef.current) {
        if (mountedRef.current) setError('Corrigez les erreurs de validation avant de sauvegarder')
        return
      }
      const nodesToSave = nodesRef.current
      const titleToSave = renamedTitleRef.current
      dirtyRef.current = false
      if (mountedRef.current) {
        setIsSaving(true)
        setError(null)
        setSaveState((prev) => ({ ...prev, status: 'saving' }))
      }
      const baseDocument = documentRef.current ?? {}
      const body = {
        document: {
          ...baseDocument,
          schemaVersion: String(baseDocument.schemaVersion ?? '1.2.0'),
          ...(titleToSave !== null ? { title: titleToSave } : {}),
          nodes: nodesToSave,
        },
        revision: revisionRef.current,
        validationMode: 'export' as const,
      }
      try {
        const response =
          (keepalive ? await documentsAPI.putDocumentKeepalive(targetId, body) : null) ??
          (await documentsAPI.putDocument(targetId, body))
        revisionRef.current = response.revision
        lastErrorToastRef.current = null
        if (mountedRef.current) {
          setFieldErrors([])
          setSaveState({
            status: dirtyRef.current ? 'pending' : 'saved',
            lastSavedAt: Date.now(),
            error: null,
          })
        }
        if (titleToSave !== null && renamedTitleRef.current === titleToSave) {
          onRenamedRef.current?.(titleToSave)
        }
        await onSaveRef.current?.(`${targetId}.json`, response.revision)
        if (!silent) toastRef.current(`Dialogue sauvegardé: ${targetId}.json`, 'success', 5000)
      } catch (err) {
        dirtyRef.current = true
        reportSaveError(err, nodesToSave, silent)
        throw err
      } finally {
        if (mountedRef.current) setIsSaving(false)
      }
    },
    [reportSaveError],
  )

  const clearAutoSaveTimer = useCallback(() => {
    if (autoSaveTimerRef.current !== null) {
      clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }
  }, [])

  /** Sauvegardes en série : jamais deux PUT concurrents sur la même révision. */
  const flushSave = useCallback(async (): Promise<void> => {
    clearAutoSaveTimer()
    if (inFlightSaveRef.current) {
      await inFlightSaveRef.current.catch(() => undefined)
    }
    if (!autoSaveEnabledRef.current || !dirtyRef.current) return
    const pending = saveExistingDocument({ silent: true })
    inFlightSaveRef.current = pending
    try {
      await pending
    } finally {
      if (inFlightSaveRef.current === pending) inFlightSaveRef.current = null
    }
  }, [clearAutoSaveTimer, saveExistingDocument])

  const flushSaveRef = useRef(flushSave)
  flushSaveRef.current = flushSave
  const saveExistingDocumentRef = useRef(saveExistingDocument)
  saveExistingDocumentRef.current = saveExistingDocument

  useEffect(() => {
    if (!autoSaveEnabled || !dirtyRef.current) return
    setSaveState((prev) => (prev.status === 'pending' ? prev : { ...prev, status: 'pending' }))
    clearAutoSaveTimer()
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null
      void flushSaveRef.current().catch(() => undefined)
    }, AUTOSAVE_DEBOUNCE_MS)
  }, [nodes, autoSaveEnabled, clearAutoSaveTimer])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearAutoSaveTimer()
      if (autoSaveEnabledRef.current && dirtyRef.current) {
        void flushSaveRef.current().catch(() => undefined)
      }
    }
  }, [clearAutoSaveTimer])

  useEffect(() => {
    if (!autoSaveEnabled) return
    const flushBeforeLeaving = () => {
      if (!dirtyRef.current) return
      clearAutoSaveTimer()
      const send = () => saveExistingDocumentRef.current({ silent: true, keepalive: true })
      const pending = inFlightSaveRef.current
        ? inFlightSaveRef.current.catch(() => undefined).then(send)
        : send()
      void pending.catch(() => undefined)
    }
    const onVisibilityChange = () => {
      if (window.document.visibilityState === 'hidden') flushBeforeLeaving()
    }
    window.addEventListener('pagehide', flushBeforeLeaving)
    window.document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('pagehide', flushBeforeLeaving)
      window.document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [autoSaveEnabled, clearAutoSaveTimer])

  const commitTitle = useCallback((nextTitle: string) => {
    renamedTitleRef.current = nextTitle
    dirtyRef.current = true
    setDisplayTitle(nextTitle)
    void flushSaveRef.current().catch(() => undefined)
  }, [])

  /**
   * Sauvegarde explicite. Dialogue existant : même PUT que l'autosave, avec toast.
   * Sans `filename` : création (« Garder et continuer » du Dashboard).
   */
  const handleSave = useCallback(async (): Promise<void> => {
    if (!isValid) {
      setError('Corrigez les erreurs de validation avant de sauvegarder')
      return
    }
    if (!canEdit) {
      const message = "Vous n'avez pas la permission de modifier ce dialogue."
      setError(message)
      throw new Error(message)
    }

    if (documentId) {
      clearAutoSaveTimer()
      if (inFlightSaveRef.current) await inFlightSaveRef.current.catch(() => undefined)
      dirtyRef.current = true
      await saveExistingDocument({ silent: false })
      return
    }

    setIsSaving(true)
    setError(null)
    setFieldErrors([])
    const nodesToSave = nodesRef.current
    const jsonContent = JSON.stringify(nodesToSave, null, 2)

    try {
      // Si le nom dérivé du titre existe déjà → réessayer avec _2, _3, … (pas d'écrasement).
      const dialogueTitle = title || 'Dialogue Unity'
      const baseId = documentIdFromTitle(dialogueTitle)
      const maxAttempts = 50
      let lastError: unknown = null
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const candidateId =
          attempt === 1 ? baseId : documentIdWithNumericSuffix(baseId, attempt)
        try {
          const result = await dialoguesAPI.exportUnityDialogue({
            json_content: jsonContent,
            title: dialogueTitle,
            filename: candidateId,
          })
          setFieldErrors([])
          await onSave?.(result.filename, 1)
          toast(
            attempt === 1
              ? `Dialogue sauvegardé: ${result.filename}`
              : `Dialogue sauvegardé sous un nouveau nom: ${result.filename}`,
            'success',
            5000,
          )
          return
        } catch (exportErr) {
          lastError = exportErr
          if (!isCanonicalRevisionConflict(exportErr)) {
            throw exportErr
          }
        }
      }
      throw lastError instanceof Error
        ? lastError
        : new Error(
            `Impossible de trouver un nom libre pour « ${baseId} » après ${maxAttempts} tentatives.`,
          )
    } catch (err) {
      reportSaveError(err, nodesToSave, false)
      throw err
    } finally {
      setIsSaving(false)
    }
  }, [canEdit, clearAutoSaveTimer, documentId, isValid, onSave, reportSaveError, saveExistingDocument, title, toast])

  useImperativeHandle(ref, () => ({
    handleSave,
    flushSave,
    isValid,
    isSaving,
  }), [flushSave, handleSave, isValid, isSaving])

  const handleGenerateContinuation = useCallback(async () => {
    if (!onGenerateContinuation) return
    const nodeId = pickContinuationNodeId(nodesRef.current, lastEditedNodeIdRef.current)
    if (!nodeId) return
    try {
      await flushSave()
    } catch {
      return
    }
    onGenerateContinuation(nodeId)
  }, [flushSave, onGenerateContinuation])

  const toolbarActions = useMemo<UnityDialogueEditorAction[]>(() => {
    const continuation: UnityDialogueEditorAction[] =
      onGenerateContinuation && canEdit
        ? [
            {
              id: 'continuation',
              label: 'Générer la suite',
              title: 'Ouvrir ce dialogue dans le graphe, sur sa dernière réplique, prêt à générer la suite',
              testId: 'unity-dialogue-editor-continue',
              onClick: () => void handleGenerateContinuation(),
            },
          ]
        : []
    return [...continuation, ...(actions ?? [])]
  }, [actions, canEdit, handleGenerateContinuation, onGenerateContinuation])

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
          position: 'relative',
          zIndex: 2,
          flexShrink: 0,
          padding: chrome.headerPadding,
          borderBottom: `1px solid ${theme.border.primary}`,
          backgroundColor: theme.background.panelHeader,
          display: 'flex',
          flexDirection: isNarrow ? 'column' : 'row',
          gap: `${chrome.headerLayoutGapRem}rem`,
          alignItems: isNarrow ? 'stretch' : 'center',
          justifyContent: 'flex-start',
        }}
      >
        <div
          style={{
            minWidth: 0,
            flex: isNarrow ? undefined : '0 1 auto',
            maxWidth: isNarrow ? undefined : '55%',
          }}
        >
          {headerSelector && (
            <div
              data-testid="unity-dialogue-editor-header-selector"
              style={{ marginBottom: '0.4rem' }}
            >
              {headerSelector}
            </div>
          )}
          <EditableDialogueTitle
            title={displayTitle || 'Éditeur de Dialogue Unity'}
            editable={autoSaveEnabled}
            onCommit={commitTitle}
            style={{
              margin: 0,
              color: theme.text.primary,
              fontSize: `${chrome.titleFontRem}rem`,
              fontWeight: 700,
              lineHeight: 1.25,
              wordBreak: 'break-word',
            }}
          />
          {(subtitle || autoSaveEnabled) && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'baseline',
                columnGap: 9,
                fontSize: `${chrome.subtitleFontRem}rem`,
                color: theme.text.secondary,
                marginTop: `${chrome.subtitleMarginTopRem}rem`,
              }}
            >
              {subtitle && <span>{subtitle}</span>}
              {autoSaveEnabled && <EditorSaveStatusLabel state={saveState} />}
            </div>
          )}
        </div>

        {toolbarActions.length > 0 && (
          <UnityDialogueEditorActionsBar
            actions={toolbarActions}
            chrome={chrome}
            stacked={isNarrow}
          />
        )}
      </div>

      {/* Contenu scrollable */}
      <div
        ref={contentRef}
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
        {readOnly && <ReadOnlyNotice reason={isGuest ? 'guest' : 'permission'} />}

        {/* Erreurs non mappées à un champ */}
        {error && fieldErrors.length === 0 && (
          <div
            role="alert"
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
              data-dialogue-node-id={node.id}
              data-testid={`unity-dialogue-node-${node.id}`}
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

              <fieldset
                disabled={readOnly}
                style={{ margin: 0, padding: 0, border: 'none', minWidth: 0 }}
              >
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
                  aria-invalid={Boolean(getFieldError(node.id, 'speaker'))}
                  style={{
                    width: '100%',
                    minWidth: 0,
                    padding: chrome.inputPadding,
                    boxSizing: 'border-box',
                    backgroundColor: theme.input.background,
                    border: `1px solid ${fieldErrorBorder(Boolean(getFieldError(node.id, 'speaker')), theme.input.border)}`,
                    color: theme.input.color,
                    borderRadius: '4px',
                  }}
                />
                <InlineFieldError message={getFieldError(node.id, 'speaker')} />
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
                  aria-invalid={Boolean(getFieldError(node.id, 'line'))}
                  style={{
                    width: '100%',
                    minWidth: 0,
                    padding: chrome.inputPadding,
                    boxSizing: 'border-box',
                    backgroundColor: theme.input.background,
                    border: `1px solid ${fieldErrorBorder(Boolean(getFieldError(node.id, 'line')), theme.input.border)}`,
                    color: theme.input.color,
                    borderRadius: '4px',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                  }}
                />
                <InlineFieldError message={getFieldError(node.id, 'line')} />
              </div>

              {/* Conséquences (si présentes ou erreur) */}
              {(node.consequences ||
                getFieldError(node.id, 'consequences.flag') ||
                getFieldError(node.id, 'consequences.description')) && (
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
                    Conséquences (flag)
                  </label>
                  <input
                    type="text"
                    value={node.consequences?.flag ?? ''}
                    onChange={(e) =>
                      updateConsequences(node.id, { flag: e.target.value })
                    }
                    placeholder="FLAG_NOM_EN_MAJUSCULES"
                    aria-invalid={Boolean(getFieldError(node.id, 'consequences.flag'))}
                    style={{
                      width: '100%',
                      minWidth: 0,
                      padding: chrome.inputPadding,
                      boxSizing: 'border-box',
                      backgroundColor: theme.input.background,
                      border: `1px solid ${fieldErrorBorder(
                        Boolean(getFieldError(node.id, 'consequences.flag')),
                        theme.input.border,
                      )}`,
                      color: theme.input.color,
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                    }}
                  />
                  <InlineFieldError message={getFieldError(node.id, 'consequences.flag')} />
                </div>
              )}

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
                      const textErr = getFieldError(node.id, `choices.${choiceIndex}.text`)
                      const testErr = getFieldError(node.id, `choices.${choiceIndex}.test`)
                      const conditionErr = getFieldError(node.id, `choices.${choiceIndex}.condition`)
                      const targetErr = getFieldError(node.id, `choices.${choiceIndex}.targetNode`)
                      const hasChoiceFieldError = Boolean(
                        textErr || testErr || conditionErr || targetErr,
                      )
                      return (
                        <div
                          key={choiceIndex}
                          style={{
                            padding: '0.75rem',
                            border: `1px solid ${hasChoiceFieldError ? theme.state.error.border : theme.border.primary}`,
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
                              aria-invalid={Boolean(textErr)}
                              style={{
                                width: '100%',
                                padding: '0.5rem',
                                boxSizing: 'border-box',
                                backgroundColor: theme.input.background,
                                border: `1px solid ${fieldErrorBorder(Boolean(textErr), theme.input.border)}`,
                                color: theme.input.color,
                                borderRadius: '6px',
                                fontFamily: 'inherit',
                                resize: 'vertical',
                              }}
                            />
                            <InlineFieldError message={textErr} />
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
                            <div className={mechanicalFormClass.testConditionRow}>
                              <div>
                                <span
                                  className={mechanicalFormClass.sectionLabel}
                                  style={{ color: theme.text.primary }}
                                >
                                  Test d'attribut
                                </span>
                                <AttributeSkillTestEditor
                                  value={choice.test}
                                  onChange={(next) =>
                                    updateChoice(node.id, choiceIndex, {
                                      test: next,
                                    })
                                  }
                                  apiErrorMessage={testErr}
                                  onClearApiError={() =>
                                    clearFieldError(node.id, `choices.${choiceIndex}.test`)
                                  }
                                  validationFieldKey={`${node.id}::choices.${choiceIndex}.test`}
                                  autoFocus={
                                    firstFieldError?.nodeId === node.id &&
                                    firstFieldError?.field === `choices.${choiceIndex}.test`
                                  }
                                />
                              </div>
                              <div>
                                <span
                                  className={mechanicalFormClass.sectionLabel}
                                  style={{ color: theme.text.primary }}
                                >
                                  Condition
                                </span>
                                <div className={mechanicalFormClass.conditionInputWrap}>
                                  <input
                                    type="text"
                                    className={mechanicalFormClass.input}
                                    value={choice.condition || ''}
                                    onChange={(e) =>
                                      updateChoice(node.id, choiceIndex, {
                                        condition: e.target.value.trim() || undefined,
                                      })
                                    }
                                    placeholder="FLAG_NAME"
                                    aria-invalid={Boolean(conditionErr)}
                                    style={{
                                      backgroundColor: theme.input.background,
                                      border: `1px solid ${fieldErrorBorder(Boolean(conditionErr), theme.input.border)}`,
                                      color: theme.input.color,
                                      fontFamily: 'monospace',
                                    }}
                                  />
                                  <InlineFieldError message={conditionErr} />
                                </div>
                              </div>
                            </div>

                            {/* Modificateurs d'influence et respect */}
                            <div className={mechanicalFormClass.deltaRow}>
                              <div className={mechanicalFormClass.deltaField}>
                                <span
                                  className={mechanicalFormClass.sectionLabel}
                                  style={{ color: theme.text.primary }}
                                >
                                  Influence
                                </span>
                                <input
                                  type="number"
                                  className={mechanicalFormClass.input}
                                  value={choice.influenceDelta ?? ''}
                                  onChange={(e) => {
                                    const value = e.target.value === '' ? undefined : parseInt(e.target.value, 10)
                                    updateChoice(node.id, choiceIndex, {
                                      influenceDelta: isNaN(value as number) ? undefined : value,
                                    })
                                  }}
                                  placeholder="+1, -1, 0"
                                  style={{
                                    backgroundColor: theme.input.background,
                                    border: `1px solid ${theme.input.border}`,
                                    color:
                                      choice.influenceDelta !== undefined && choice.influenceDelta >= 0
                                        ? theme.state.success.color
                                        : choice.influenceDelta !== undefined
                                          ? theme.state.error.color
                                          : theme.input.color,
                                    fontFamily: 'monospace',
                                    fontWeight: choice.influenceDelta !== undefined ? 'bold' : 'normal',
                                  }}
                                />
                              </div>
                              <div className={mechanicalFormClass.deltaField}>
                                <span
                                  className={mechanicalFormClass.sectionLabel}
                                  style={{ color: theme.text.primary }}
                                >
                                  Respect
                                </span>
                                <input
                                  type="number"
                                  className={mechanicalFormClass.input}
                                  value={choice.respectDelta ?? ''}
                                  onChange={(e) => {
                                    const value = e.target.value === '' ? undefined : parseInt(e.target.value, 10)
                                    updateChoice(node.id, choiceIndex, {
                                      respectDelta: isNaN(value as number) ? undefined : value,
                                    })
                                  }}
                                  placeholder="+1, -1, 0"
                                  style={{
                                    backgroundColor: theme.input.background,
                                    border: `1px solid ${theme.input.border}`,
                                    color:
                                      choice.respectDelta !== undefined && choice.respectDelta >= 0
                                        ? theme.state.success.color
                                        : choice.respectDelta !== undefined
                                          ? theme.state.error.color
                                          : theme.input.color,
                                    fontFamily: 'monospace',
                                    fontWeight: choice.respectDelta !== undefined ? 'bold' : 'normal',
                                  }}
                                />
                              </div>
                            </div>

                            {/* Traits requis */}
                            <div>
                              <span
                                className={mechanicalFormClass.sectionLabel}
                                style={{ color: theme.text.primary, display: 'block', marginBottom: '0.35rem' }}
                              >
                                Traits requis
                              </span>
                              <TraitRequirementsEditor
                                idPrefix={`unity-${node.id}-${choiceIndex}-trait-requirements`}
                                value={choice.traitRequirements}
                                onChange={(traitRequirements) =>
                                  updateChoice(node.id, choiceIndex, { traitRequirements })
                                }
                              />
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
                                aria-invalid={Boolean(targetErr)}
                                style={{
                                  flex: 1,
                                  minWidth: 0,
                                  padding: chrome.inputPadding,
                                  boxSizing: 'border-box',
                                  backgroundColor: theme.input.background,
                                  border: `1px solid ${fieldErrorBorder(Boolean(targetErr), theme.input.border)}`,
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
                                  border: `1px solid ${theme.button.default.border}`,
                                  borderRadius: '6px',
                                  backgroundColor: theme.button.default.background,
                                  color: theme.button.default.color,
                                  cursor: 'pointer',
                                  fontSize: '1rem',
                                  lineHeight: 1,
                                }}
                              >
                                ✕
                              </button>
                            </div>
                            <datalist id={`node-ids-${node.id}`}>
                              {Array.from(nodeIds).map((id) => (
                                <option key={id} value={id} />
                              ))}
                            </datalist>
                            <InlineFieldError message={targetErr} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Bouton ajouter choix */}
              {!readOnly && (!node.choices || node.choices.length < 4) && (
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

              </fieldset>

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

