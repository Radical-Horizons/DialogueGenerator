/**
 * Brief de la scène (board `Fiche`) : lu avec ses mentions cliquables, écrit en texte brut.
 *
 * Un clic dans le texte (ou Entrée) ouvre le champ au même endroit, ÉCHAP ou la sortie le
 * remet en forme. `@` suivi d'une saisie propose les fiches du GDD. La fiche de scène
 * s'enregistre à chaque frappe.
 */
import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import { useGraphStore } from '../../store/graphStore'
import { mentionCatalogs, useSceneCatalogStore } from '../../store/sceneCatalogStore'
import { useAutoGrowTextarea } from '../../hooks/useAutoGrowTextarea'
import {
  CATEGORIES_WITH_MODE,
  addMentionedEntry,
  findMentionQuery,
  sheetEntryNames,
  speakerKey,
  splitBriefMentions,
  type MentionCategory,
  type SceneSheet,
} from '../../utils/sceneSheet'
import {
  redesignAccent,
  redesignHairline,
  redesignRadius,
  redesignSurface,
  redesignText,
} from '../../theme/redesignTokens'
import type { ScenePreviewTarget } from './SceneEntryPreview'
import { SCENE_CATEGORY_LABELS, fieldStyle, monoLabel } from './sceneStyles'

const SUGGESTION_LIMIT = 8
const MIN_HEIGHT = 88
const MAX_HEIGHT = 320

/** Mêmes métriques en lecture et en écriture : rien ne saute quand on passe de l'une à l'autre. */
const textBox: CSSProperties = {
  width: '100%',
  minHeight: MIN_HEIGHT,
  boxSizing: 'border-box',
  padding: '7px 9px',
  fontFamily: 'inherit',
  fontSize: '15px',
  lineHeight: '24px',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'break-word',
}

interface Suggestion {
  category: MentionCategory
  name: string
  entryId: string | null
}

export function SceneBriefField({
  sheet,
  readOnly,
  onPreview,
}: {
  sheet: SceneSheet
  readOnly: boolean
  onPreview: (target: ScenePreviewTarget) => void
}) {
  const updateScene = useGraphStore((state) => state.updateScene)
  const characters = useSceneCatalogStore((state) => state.characters)
  const places = useSceneCatalogStore((state) => state.places)
  const items = useSceneCatalogStore((state) => state.items)
  const species = useSceneCatalogStore((state) => state.species)
  const communities = useSceneCatalogStore((state) => state.communities)
  const catalogs = useMemo(
    () => mentionCatalogs({ characters, places, items, species, communities }),
    [characters, places, items, species, communities],
  )
  const names = useMemo(
    () => [
      ...new Set([
        ...sheetEntryNames(sheet),
        ...Object.values(catalogs).flatMap((entries) => entries.map((entry) => entry.name)),
      ]),
    ],
    [sheet, catalogs],
  )

  const [editing, setEditing] = useState(false)
  const [caret, setCaret] = useState<number | null>(null)
  const [active, setActive] = useState(0)
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const readRef = useRef<HTMLDivElement>(null)
  /** Curseur à poser, ou retour à la lecture, après le prochain rendu. */
  const pendingCaret = useRef<number | null>(null)
  const focusRead = useRef(false)
  const listId = useId()
  const hintId = useId()

  const brief = sheet.brief
  const writing = !readOnly && (editing || brief === '')
  useAutoGrowTextarea(textareaRef, writing ? brief : '', {
    minHeightPx: MIN_HEIGHT,
    maxHeightPx: MAX_HEIGHT,
  })

  useLayoutEffect(() => {
    const field = textareaRef.current
    if (writing && field && pendingCaret.current !== null) {
      const position = pendingCaret.current
      pendingCaret.current = null
      field.focus()
      field.setSelectionRange(position, position)
      setCaret(position)
    }
    if (!writing && focusRead.current) {
      focusRead.current = false
      readRef.current?.focus()
    }
  }, [writing, brief])

  const query = writing && caret !== null ? findMentionQuery(brief, caret, names) : null
  const suggestions = useMemo(() => {
    if (!query) return []
    const wanted = speakerKey(query.query)
    if (!wanted) return []
    const found: Array<Suggestion & { rank: number }> = []
    for (const category of CATEGORIES_WITH_MODE) {
      for (const entry of catalogs[category]) {
        const at = speakerKey(entry.name).indexOf(wanted)
        if (at < 0) continue
        const pageId = entry.data?.notion_page_id
        found.push({
          category,
          name: entry.name,
          entryId: typeof pageId === 'string' ? pageId : null,
          rank: at === 0 ? 0 : 1,
        })
      }
    }
    return found.sort((a, b) => a.rank - b.rank).slice(0, SUGGESTION_LIMIT)
  }, [query?.query, catalogs]) // eslint-disable-line react-hooks/exhaustive-deps
  const open = query !== null && query.start !== dismissedAt && suggestions.length > 0
  const activeIndex = Math.min(active, suggestions.length - 1)

  const choose = (suggestion: Suggestion) => {
    if (!query || caret === null) return
    const rest = brief.slice(caret)
    const spacer = rest === '' || /^[\p{L}\p{N}]/u.test(rest) ? ' ' : ''
    const mention = `@${suggestion.name}`
    const next = brief.slice(0, query.start) + mention + spacer + rest
    updateScene((current) =>
      addMentionedEntry(
        { ...current, brief: next },
        suggestion.category,
        suggestion.name,
        suggestion.entryId,
      ),
    )
    pendingCaret.current = query.start + mention.length + spacer.length
    setDismissedAt(query.start)
    setActive(0)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const step = event.key === 'ArrowDown' ? 1 : -1
        setActive((activeIndex + step + suggestions.length) % suggestions.length)
        return
      }
      const plainEnter =
        event.key === 'Enter' &&
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.nativeEvent.isComposing
      if (plainEnter || (event.key === 'Tab' && !event.shiftKey)) {
        event.preventDefault()
        choose(suggestions[activeIndex])
        return
      }
    }
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    if (open && query) {
      setDismissedAt(query.start)
      return
    }
    if (brief === '') {
      textareaRef.current?.blur()
      return
    }
    focusRead.current = true
    setEditing(false)
    setCaret(null)
  }

  const startWriting = (position: number) => {
    if (readOnly) return
    pendingCaret.current = position
    setEditing(true)
  }

  /** Un clic pose le curseur là où il a été donné ; une sélection à copier reste en lecture. */
  const handleReadClick = (event: MouseEvent<HTMLDivElement>) => {
    const selection = window.getSelection()
    if (selection && !selection.isCollapsed) return
    const segment = (event.target as HTMLElement).closest<HTMLElement>('[data-start]')
    const inSegment = segment && selection?.anchorNode && segment.contains(selection.anchorNode)
    startWriting(
      inSegment ? Number(segment.dataset.start) + selection.anchorOffset : brief.length,
    )
  }

  const openPreview = (name: string, anchor: HTMLElement) => {
    const key = speakerKey(name)
    const linked = sheet.linkedEntries.find((entry) => speakerKey(entry.name) === key)?.category
    const order = linked ? [linked, ...CATEGORIES_WITH_MODE] : [...CATEGORIES_WITH_MODE]
    const category = order.find((candidate) =>
      catalogs[candidate as MentionCategory]?.some((entry) => speakerKey(entry.name) === key),
    )
    if (category) onPreview({ category: category as MentionCategory, name, anchor })
  }
  const hasSheet = (name: string) =>
    Object.values(catalogs).some((entries) =>
      entries.some((entry) => speakerKey(entry.name) === speakerKey(name)),
    )

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 5, maxWidth: 640 }}>
      <span style={monoLabel}>Brief — ce qui doit se passer</span>
      {writing ? (
        <textarea
          ref={textareaRef}
          aria-label="Brief de la scène"
          aria-autocomplete="list"
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined}
          value={brief}
          placeholder="Ce qui doit se passer dans la scène. @ cite une fiche du GDD."
          onFocus={(event) => {
            setEditing(true)
            setCaret(event.currentTarget.selectionStart)
          }}
          onBlur={(event) => {
            // La fenêtre perd le focus (Alt+Tab) : le champ reste l'élément actif.
            if (document.activeElement === event.currentTarget) return
            setEditing(false)
            setCaret(null)
            setDismissedAt(null)
          }}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
          onChange={(event) => {
            const value = event.target.value
            setEditing(true)
            setCaret(event.target.selectionStart)
            setActive(0)
            // Effacer dans le nom, ou le `@` lui-même, repropose les fiches.
            if (dismissedAt !== null && (value.length < brief.length || value[dismissedAt] !== '@')) {
              setDismissedAt(null)
            }
            updateScene((current) => ({ ...current, brief: value }))
          }}
          onKeyDown={handleKeyDown}
          style={{ ...fieldStyle, ...textBox, resize: 'none' }}
        />
      ) : (
        <div
          ref={readRef}
          role="group"
          aria-label="Brief de la scène"
          aria-describedby={readOnly ? undefined : hintId}
          // Focalisable aussi en lecture seule : un long brief défile au clavier.
          tabIndex={0}
          onClick={handleReadClick}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.target !== event.currentTarget) return
            event.preventDefault()
            startWriting(brief.length)
          }}
          style={{
            ...textBox,
            border: '1px solid transparent',
            borderRadius: redesignRadius.control,
            color: redesignText.body,
            cursor: readOnly ? 'default' : 'text',
            maxHeight: MAX_HEIGHT,
            overflowY: 'auto',
          }}
        >
          {brief === '' ? (
            <span style={{ color: redesignText.muted }}>Aucun brief.</span>
          ) : (
            splitBriefMentions(brief, names).map((segment) =>
              segment.mention && hasSheet(segment.mention) ? (
                <button
                  key={segment.start}
                  type="button"
                  aria-haspopup="dialog"
                  onClick={(event) => {
                    event.stopPropagation()
                    openPreview(segment.mention as string, event.currentTarget)
                  }}
                  style={{
                    display: 'inline',
                    margin: 0,
                    padding: 0,
                    border: 'none',
                    borderRadius: redesignRadius.control,
                    background: redesignAccent.selectedBg,
                    color: redesignAccent.light,
                    font: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  {segment.text}
                </button>
              ) : (
                <span key={segment.start} data-start={segment.start}>
                  {segment.text}
                </span>
              ),
            )
          )}
        </div>
      )}
      {!writing && !readOnly ? (
        <span id={hintId} hidden>
          Entrée pour modifier le brief.
        </span>
      ) : null}
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Fiches à citer"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 20,
            width: 340,
            maxWidth: '100%',
            margin: 0,
            padding: 5,
            listStyle: 'none',
            background: redesignSurface.node,
            border: `1px solid ${redesignHairline.strong}`,
            borderRadius: redesignRadius.node,
            boxShadow: '0 18px 44px rgba(0, 0, 0, 0.5)',
          }}
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={`${suggestion.category}:${suggestion.name}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              // Le champ garde le focus : sans cela le clic le ferait sortir avant le choix.
              onMouseDown={(event) => {
                event.preventDefault()
                choose(suggestion)
              }}
              onMouseEnter={() => setActive(index)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 9,
                padding: '5px 9px',
                borderRadius: redesignRadius.control,
                background: index === activeIndex ? redesignAccent.selectedBg : 'transparent',
                color: redesignText.body,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              <span>{suggestion.name}</span>
              <span style={monoLabel}>{SCENE_CATEGORY_LABELS[suggestion.category]}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
