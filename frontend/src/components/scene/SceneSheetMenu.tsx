/**
 * « fiche de scène ▾ » (README § 13) : ce que la fiche ne montre pas elle-même. Les fenêtres
 * sont les composants existants ; une entrée sans droit n'apparaît pas.
 *
 * Monté dans la fiche, donc remonté à chaque dialogue : changer de scène ferme tout.
 */
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import * as contextAPI from '../../api/context'
import { TOUCH_TARGET_MIN_PX } from '../../constants'
import { useAuthStore } from '../../store/authStore'
import { useGraphStore } from '../../store/graphStore'
import { useSceneCatalogStore } from '../../store/sceneCatalogStore'
import { effectiveSceneSheet } from '../../store/slices/sceneSlice'
import { theme } from '../../theme'
import {
  redesignHairline,
  redesignRadius,
  redesignSpacing,
  redesignSurface,
  redesignText,
} from '../../theme/redesignTokens'
import { getErrorMessage } from '../../types/errors'
import type { TemplateConfiguration } from '../../types/template'
import { confirmDialogueDeletion, deleteDialogueAndNotify } from '../../utils/dialogueDeletion'
import { dialogueDocumentId } from '../../utils/formatDialogueTitle'
import { speakerKey } from '../../utils/sceneSheet'
import { buildSceneTemplateConfiguration, locateGeneratorPlace } from '../../utils/sceneTemplate'
import { TemplateCreatorModal } from '../generation/TemplateCreatorModal'
import { useToast } from '../shared'
import { DialogueMetadataPanel } from '../unityDialogues/DialogueMetadataPanel'
import { DialoguePermissionsPanel } from '../unityDialogues/DialoguePermissionsPanel'
import { DialogueSharingModal } from '../unityDialogues/DialogueSharingModal'
import { SceneFlagsWindow } from './SceneFlagsWindow'
import { SceneTemplateApplyWindow } from './SceneTemplateApplyWindow'
import { SceneWindowFocus } from './SceneWindow'
import { buttonStyle } from './sceneStyles'

type SceneWindowId = 'flags' | 'apply' | 'metadata' | 'share' | 'permissions'

interface MenuEntry {
  label: string
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
}

const MENU_WIDTH = 240
const MENU_MARGIN = 9

async function sceneTemplateSnapshot(): Promise<TemplateConfiguration> {
  const sheet = effectiveSceneSheet(useGraphStore.getState())
  const place = sheet.place?.name.trim() ?? ''
  const placeIsEntry = Boolean(
    place &&
      (sheet.place?.entryId ||
        useSceneCatalogStore
          .getState()
          .places.some((item) => speakerKey(item.name) === speakerKey(place))),
  )
  const location = placeIsEntry
    ? await locateGeneratorPlace(
        place,
        async () => (await contextAPI.listSceneRegions()).regions,
        async (region) => (await contextAPI.getSceneSubLocations(region)).sub_locations,
        // Sans les régions, le template se garde quand même.
      ).catch(() => undefined)
    : undefined
  return buildSceneTemplateConfiguration(sheet, { location, placeIsEntry })
}

export function SceneSheetMenu({
  documentId,
  title,
  readOnly,
}: {
  documentId: string
  title: string
  readOnly: boolean
}) {
  const user = useAuthStore((state) => state.user)
  const canDelete = useGraphStore((state) => state.canDeleteDocument)
  const isOwner = useGraphStore((state) => state.isDocumentOwner)
  const isDeleting = useGraphStore((state) => state.isDeletingDocument)
  const toast = useToast()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const [openWindow, setOpenWindow] = useState<SceneWindowId | null>(null)
  const [snapshot, setSnapshot] = useState<TemplateConfiguration | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const isOpen = position !== null
  const hasAccount = Boolean(user && user.role !== 'guest')
  const serverId = dialogueDocumentId(documentId)
  const closeWindow = () => setOpenWindow(null)

  const open = () => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    setPosition({
      top: rect.bottom + 5,
      left: Math.max(
        MENU_MARGIN,
        Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - MENU_MARGIN),
      ),
    })
  }

  const close = () => {
    setPosition(null)
    triggerRef.current?.focus()
  }

  const items = () => [
    ...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ??
      []),
  ]

  useEffect(() => {
    if (!isOpen) return
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    const onPointerDown = (event: Event) => {
      const node = event.target as Node
      if (!menuRef.current?.contains(node) && !triggerRef.current?.contains(node)) {
        setPosition(null)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [isOpen])

  const onMenuKeyDown = (event: ReactKeyboardEvent) => {
    // Les raccourcis du graphe ne jouent pas derrière un menu ouvert.
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    // Sans `preventDefault` : la tabulation repart du bouton du menu.
    if (event.key === 'Tab') {
      close()
      return
    }
    const list = items()
    const at = list.indexOf(document.activeElement as HTMLButtonElement)
    const next = {
      ArrowDown: (at + 1) % list.length,
      ArrowUp: (at - 1 + list.length) % list.length,
      Home: 0,
      End: list.length - 1,
    }[event.key]
    if (next === undefined) return
    event.preventDefault()
    list[next]?.focus()
  }

  const saveAsTemplate = async () => {
    const next = await sceneTemplateSnapshot()
    if (alive.current) setSnapshot(next)
  }

  const remove = async () => {
    const graph = useGraphStore.getState()
    if (!confirmDialogueDeletion(title, graph.hasUnsavedChanges)) return
    graph.setDeletingDocument(true)
    try {
      await deleteDialogueAndNotify(serverId)
    } catch (error) {
      const latest = useGraphStore.getState()
      if (latest.documentId === documentId) latest.setDeletingDocument(false)
      toast(`Suppression impossible : ${getErrorMessage(error)}`, 'error')
    }
  }

  const entries: MenuEntry[] = [
    { label: 'Flags du dialogue', onSelect: () => setOpenWindow('flags') },
    ...(hasAccount
      ? [{ label: 'Enregistrer comme template', onSelect: () => void saveAsTemplate() }]
      : []),
    ...(!readOnly
      ? [{ label: 'Appliquer un template…', onSelect: () => setOpenWindow('apply') }]
      : []),
    { label: 'Métadonnées', onSelect: () => setOpenWindow('metadata') },
    ...(isOwner || user?.role === 'admin'
      ? [{ label: 'Partager', onSelect: () => setOpenWindow('share') }]
      : []),
    ...(hasAccount ? [{ label: 'Permissions', onSelect: () => setOpenWindow('permissions') }] : []),
    ...(canDelete
      ? [
          {
            label: isDeleting ? 'Suppression…' : 'Supprimer',
            onSelect: () => void remove(),
            danger: true,
            disabled: isDeleting,
          },
        ]
      : []),
  ]

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => (isOpen ? close() : open())}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown') return
          event.preventDefault()
          event.stopPropagation()
          open()
        }}
        style={{ ...buttonStyle, border: 'none', padding: 0 }}
      >
        fiche de scène ▾
      </button>

      {position
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label="Fiche de scène"
              onKeyDown={onMenuKeyDown}
              style={{
                position: 'fixed',
                top: position.top,
                left: position.left,
                zIndex: 8000,
                width: MENU_WIDTH,
                maxHeight: `calc(100vh - ${position.top + MENU_MARGIN}px)`,
                overflowY: 'auto',
                boxSizing: 'border-box',
                padding: `${redesignSpacing.xs}px 0`,
                background: redesignSurface.node,
                border: `1px solid ${redesignHairline.strong}`,
                borderRadius: redesignRadius.node,
                boxShadow: theme.shadow.card,
              }}
            >
              {entries.map((entry) => (
                <button
                  key={entry.label}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  disabled={entry.disabled}
                  onClick={() => {
                    close()
                    entry.onSelect()
                  }}
                  onFocus={(event) => {
                    event.currentTarget.style.background = redesignHairline.rowHover
                  }}
                  onBlur={(event) => {
                    event.currentTarget.style.background = 'transparent'
                  }}
                  onMouseEnter={(event) => event.currentTarget.focus()}
                  style={{
                    display: 'block',
                    width: '100%',
                    minHeight: TOUCH_TARGET_MIN_PX,
                    padding: `0 ${redesignSpacing.md}px`,
                    border: 'none',
                    background: 'transparent',
                    color: entry.danger ? theme.state.error.color : redesignText.body,
                    fontFamily: 'inherit',
                    fontSize: '13px',
                    textAlign: 'left',
                    cursor: entry.disabled ? 'default' : 'pointer',
                  }}
                >
                  {entry.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}

      {openWindow === 'flags' ? (
        <SceneFlagsWindow readOnly={readOnly} trigger={triggerRef} onClose={closeWindow} />
      ) : null}
      {openWindow === 'apply' ? (
        <SceneTemplateApplyWindow trigger={triggerRef} onClose={closeWindow} />
      ) : null}
      {openWindow === 'metadata' ? (
        <SceneWindowFocus trigger={triggerRef} onEscape={closeWindow}>
          <DialogueMetadataPanel documentId={serverId} open onClose={closeWindow} />
        </SceneWindowFocus>
      ) : null}
      {openWindow === 'share' ? (
        <SceneWindowFocus trigger={triggerRef} onEscape={closeWindow}>
          <DialogueSharingModal documentId={serverId} open onClose={closeWindow} />
        </SceneWindowFocus>
      ) : null}
      {openWindow === 'permissions' ? (
        <SceneWindowFocus trigger={triggerRef} onEscape={closeWindow}>
          <DialoguePermissionsPanel documentId={serverId} open onClose={closeWindow} />
        </SceneWindowFocus>
      ) : null}
      {snapshot ? (
        // La fenêtre de création garde ÉCHAP : elle l'ignore pendant l'enregistrement.
        <SceneWindowFocus trigger={triggerRef}>
          <TemplateCreatorModal isOpen snapshot={snapshot} onClose={() => setSnapshot(null)} />
        </SceneWindowFocus>
      ) : null}
    </>
  )
}
