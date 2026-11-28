/**
 * Aperçu d'une fiche du GDD citée dans la scène (board `Fiche`), puis son détail complet
 * en fenêtre. ÉCHAP ferme et rend le focus à ce qui l'a ouvert.
 */
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { mentionCatalogs, useSceneCatalogStore } from '../../store/sceneCatalogStore'
import { ContextDetail } from '../context/ContextDetail'
import { extractTextFromGddValue, getGddEntitySummary } from '../../utils/gddSummary'
import { entityInitials } from '../../utils/entityInitials'
import { speakerKey, type MentionCategory } from '../../utils/sceneSheet'
import {
  redesignAccent,
  redesignHairline,
  redesignRadius,
  redesignSpacing,
  redesignSurface,
  redesignText,
} from '../../theme/redesignTokens'
import { buttonStyle, initialsStyle, monoLabel } from './sceneStyles'

export interface ScenePreviewTarget {
  category: MentionCategory
  name: string
  /** Mention ou puce qui a ouvert l'aperçu : le focus y revient. */
  anchor: HTMLElement
}

const GDD_CATEGORY_NAMES: Record<MentionCategory, string> = {
  characters: 'Personnages',
  locations: 'Lieux',
  items: 'Objets',
  species: 'Espèces',
  communities: 'Communautés',
}

const WIDTH = 340
const MARGIN = 9
const SUMMARY_LENGTH = 420

const linkStyle = {
  border: 'none',
  background: 'transparent',
  padding: 0,
  fontFamily: 'inherit',
  fontSize: '12.5px',
  color: redesignAccent.text,
  cursor: 'pointer',
} as const

export function SceneEntryPreview({
  target,
  onClose,
}: {
  target: ScenePreviewTarget
  onClose: () => void
}) {
  const entry = useSceneCatalogStore((state) =>
    mentionCatalogs(state)[target.category].find(
      (item) => speakerKey(item.name) === speakerKey(target.name),
    ),
  )
  const [full, setFull] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const cardRef = useRef<HTMLDivElement>(null)
  const openRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  // Même objet d'un rendu à l'autre : sinon la fiche replie les sections dépliées.
  const item = useMemo(
    () =>
      entry ? { name: entry.name, data: (entry.data ?? {}) as Record<string, unknown> } : null,
    [entry],
  )

  const close = () => {
    onClose()
    if (target.anchor.isConnected) target.anchor.focus()
  }

  useLayoutEffect(() => {
    const rect = target.anchor.getBoundingClientRect()
    const height = cardRef.current?.offsetHeight ?? 0
    const below = rect.bottom + MARGIN
    setPosition({
      left: Math.max(MARGIN, Math.min(rect.left, window.innerWidth - WIDTH - MARGIN)),
      top:
        below + height <= window.innerHeight
          ? below
          : Math.max(MARGIN, rect.top - height - MARGIN),
    })
  }, [target])

  useEffect(() => {
    if (full) closeRef.current?.focus()
    else openRef.current?.focus()
  }, [full, target])

  // Un clic ailleurs ferme l'aperçu, sans voler le focus à ce qui est cliqué.
  useEffect(() => {
    if (full) return
    const onPointerDown = (event: Event) => {
      const node = event.target as Node
      if (!cardRef.current?.contains(node) && !target.anchor.contains(node)) onClose()
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [full, target, onClose])

  /** La fenêtre est modale : Tab tourne dans ses commandes. */
  const keepFocusInside = (event: KeyboardEvent<HTMLElement>) => {
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button, a[href]')]
    const at = controls.indexOf(document.activeElement as HTMLElement)
    const edge = event.shiftKey ? 0 : controls.length - 1
    // `at` vaut -1 quand le focus est sur la fenêtre elle-même (clic dans le texte).
    if (at !== -1 && at !== edge) return
    event.preventDefault()
    controls[event.shiftKey ? controls.length - 1 : 0].focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // L'aperçu vit en fin de page : sans cela, Tab en sortirait du document sans le fermer.
    // `close` rend le focus à ce qui l'a ouvert, d'où le navigateur poursuit la tabulation.
    if (event.key === 'Tab') {
      if (full) keepFocusInside(event)
      else close()
    }
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    close()
  }

  /** Le focus parti ailleurs ferme l'aperçu, sans être ramené. */
  const onCardBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null
    if (next && !event.currentTarget.contains(next) && !target.anchor.contains(next)) onClose()
  }

  if (!entry || !item) return null
  const { data } = item
  const values = (data.values ?? {}) as Record<string, unknown>
  const epithet = extractTextFromGddValue(values['Épithète'])
  const occupation = extractTextFromGddValue(values['Occupation'])
  const summary = getGddEntitySummary(data, SUMMARY_LENGTH)

  if (full) {
    return createPortal(
      <div
        onClick={close}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.5)',
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Fiche ${entry.name}`}
          tabIndex={-1}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={onKeyDown}
          style={{
            width: 'min(720px, 94vw)',
            height: '82vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            background: redesignSurface.node,
            border: `1px solid ${redesignHairline.strong}`,
            borderRadius: redesignRadius.frame,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: `${redesignSpacing.sm}px ${redesignSpacing.md}px`,
              borderBottom: `1px solid ${redesignHairline.strong}`,
            }}
          >
            <span style={monoLabel}>Fiche du GDD · {GDD_CATEGORY_NAMES[target.category]}</span>
            <button ref={closeRef} type="button" onClick={close} style={buttonStyle}>
              Fermer
            </button>
          </div>
          <ContextDetail item={item} />
        </div>
      </div>,
      document.body,
    )
  }

  return createPortal(
    <div
      ref={cardRef}
      role="dialog"
      aria-label={`Aperçu de la fiche ${entry.name}`}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onBlur={onCardBlur}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        zIndex: 8000,
        width: WIDTH,
        maxWidth: `calc(100vw - ${MARGIN * 2}px)`,
        maxHeight: '70vh',
        overflowY: 'auto',
        boxSizing: 'border-box',
        background: redesignSurface.node,
        color: redesignText.body,
        border: `1px solid ${redesignHairline.strong}`,
        borderRadius: redesignRadius.node,
        boxShadow: '0 18px 44px rgba(0, 0, 0, 0.5)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '14px 14px 9px' }}>
        <span aria-hidden="true" style={{ ...initialsStyle, width: 32, height: 32, fontSize: '11px' }}>
          {entityInitials(entry.name)}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span style={{ fontSize: '15px', fontWeight: 500, color: redesignText.strong }}>
            {entry.name}
            {epithet ? (
              <span
                style={{
                  fontWeight: 400,
                  fontSize: '12.5px',
                  fontStyle: 'italic',
                  color: redesignText.secondary,
                }}
              >
                {' '}
                — {epithet}
              </span>
            ) : null}
          </span>
          <span style={{ ...monoLabel, color: redesignText.muted, whiteSpace: 'normal' }}>
            {GDD_CATEGORY_NAMES[target.category]}
            {occupation ? ` · ${occupation}` : ''}
          </span>
        </div>
      </div>
      <p style={{ margin: 0, padding: '0 14px 14px', fontSize: '13px', lineHeight: 1.55 }}>
        {summary || 'Cette fiche n’a pas de résumé.'}
      </p>
      <div style={{ padding: '9px 14px', borderTop: `1px solid ${redesignHairline.strong}` }}>
        <button ref={openRef} type="button" onClick={() => setFull(true)} style={linkStyle}>
          Ouvrir la fiche ↗
        </button>
      </div>
    </div>,
    document.body,
  )
}
