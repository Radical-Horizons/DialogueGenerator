/**
 * Sélecteur compact de dialogue Unity intégré à la toolbar (Story 17.7).
 *
 * Pattern combobox WAI-ARIA : déclencheur `role="combobox"`, panneau `role="listbox"`,
 * options `role="option"` + `aria-selected`. Recherche, tri, compteur, raccourci `/`
 * (global, comme `UnityDialogueList`), navigation `↑/↓/Home/End`, clic extérieur pour fermer,
 * exposition `refresh()` via ref impérative.
 *
 * Utilisé en mode narrow uniquement (le mode desktop conserve la colonne
 * latérale `UnityDialogueList`).
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { theme } from '../../theme'
import { remSize } from '../../theme/uiTypography'
import type { UnityDialogueMetadata } from '../../types/api'
import { useDialogueListData } from '../../hooks/useDialogueListData'
import { StyledSelect } from '../shared/StyledSelect'
import { UnityDialogueItem } from './UnityDialogueItem'
import {
  DialogueListContextMenu,
  type DialogueListContextMenuState,
} from './DialogueListContextMenu'
import {
  formatDialogueTitle,
  getDialogueDisplayTitle,
  normalizeDialogueFilenameKey,
} from '../../utils/formatDialogueTitle'

export interface DialogueComboboxRef {
  /**
   * Re-fetch la liste depuis l'API.
   *
   * Signature volontairement compatible avec `UnityDialogueListRef.refresh`
   * pour qu'un même `ref` puisse être passé à l'un OU l'autre composant
   * selon le mode narrow / desktop (Story 17.7).
   */
  refresh: () => Promise<void> | void
}

interface DialogueComboboxProps {
  selectedFilename: string | null
  onSelect: (dialogue: UnityDialogueMetadata | null) => void
  /** Largeur du déclencheur (par défaut adaptative au contenu, max 240px). */
  triggerStyle?: CSSProperties
}

const TRIGGER_LABEL_FALLBACK = 'Choisir un dialogue'

export const DialogueCombobox = forwardRef<DialogueComboboxRef, DialogueComboboxProps>(
  function DialogueCombobox({ selectedFilename, onSelect, triggerStyle }, ref) {
    const {
      dialogues,
      filteredDialogues,
      total,
      filteredCount,
      searchQuery,
      setSearchQuery,
      sortType,
      setSortType,
      isLoading,
      error,
      refresh,
    } = useDialogueListData()

    const [isOpen, setIsOpen] = useState(false)
    const [activeOptionIndex, setActiveOptionIndex] = useState<number | null>(null)
    const [contextMenu, setContextMenu] = useState<DialogueListContextMenuState | null>(null)

    const rootRef = useRef<HTMLDivElement>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const searchInputRef = useRef<HTMLInputElement>(null)
    const optionElRefs = useRef<Map<string, HTMLDivElement>>(new Map())
    const panelId = useId()
    const triggerLabelId = useId()

    useImperativeHandle(ref, () => ({ refresh }), [refresh])

    const wasOpenRef = useRef(false)

    const close = useCallback(() => {
      setIsOpen(false)
      setActiveOptionIndex(null)
    }, [])

    const handleItemClick = useCallback(
      (dialogue: UnityDialogueMetadata) => {
        onSelect(dialogue)
        close()
      },
      [onSelect, close]
    )

    const handleItemContextMenu = useCallback(
      (dialogue: UnityDialogueMetadata, e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setContextMenu({ dialogue, clientX: e.clientX, clientY: e.clientY })
      },
      [],
    )

    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement | null
        const inGenericTypingField =
          !!target &&
          (target.tagName === 'TEXTAREA' ||
            target.isContentEditable ||
            (target.tagName === 'INPUT' && target !== searchInputRef.current))

        if (e.key === 'Escape' && isOpen) {
          e.preventDefault()
          close()
          return
        }

        if (e.key === '/') {
          if (inGenericTypingField) return
          e.preventDefault()
          if (!isOpen) {
            setIsOpen(true)
          } else {
            searchInputRef.current?.focus()
            searchInputRef.current?.select()
          }
          return
        }

        if (!isOpen) return

        if (e.key === 'ArrowDown' && target === triggerRef.current && filteredDialogues.length > 0) {
          e.preventDefault()
          setActiveOptionIndex(0)
        }
      }

      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, close, filteredDialogues.length])

    useEffect(() => {
      if (!isOpen) return

      const handleMouseDown = (e: MouseEvent) => {
        const root = rootRef.current
        if (root && !root.contains(e.target as Node)) {
          close()
        }
      }

      document.addEventListener('mousedown', handleMouseDown)
      return () => document.removeEventListener('mousedown', handleMouseDown)
    }, [isOpen, close])

    useEffect(() => {
      if (isOpen) {
        setActiveOptionIndex(null)
        requestAnimationFrame(() => searchInputRef.current?.focus())
      }
    }, [isOpen])

    // Restore trigger focus after close in layout (not rAF): panel unmount moves
    // focus to body; sync restore avoids CI flakes where rAF lags the assertion.
    useLayoutEffect(() => {
      if (isOpen) {
        wasOpenRef.current = true
        return
      }
      if (!wasOpenRef.current) return
      wasOpenRef.current = false
      triggerRef.current?.focus()
    }, [isOpen])

    const filteredListSignature = useMemo(
      () => filteredDialogues.map((d) => d.filename).join('\0'),
      [filteredDialogues]
    )

    useEffect(() => {
      if (activeOptionIndex === null) return
      if (filteredDialogues.length === 0) {
        setActiveOptionIndex(null)
        return
      }
      if (activeOptionIndex >= filteredDialogues.length) {
        setActiveOptionIndex(filteredDialogues.length - 1)
      }
    }, [filteredListSignature, filteredDialogues.length, activeOptionIndex])

    const activeOptionFilename =
      activeOptionIndex !== null ? filteredDialogues[activeOptionIndex]?.filename : undefined

    useLayoutEffect(() => {
      if (!isOpen || activeOptionIndex === null || !activeOptionFilename) return
      optionElRefs.current.get(activeOptionFilename)?.focus()
    }, [isOpen, activeOptionIndex, activeOptionFilename])

    const handleOptionKeyDown = useCallback(
      (index: number) => (e: ReactKeyboardEvent<HTMLDivElement>) => {
        const len = filteredDialogues.length
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          const d = filteredDialogues[index]
          if (d) handleItemClick(d)
          return
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          if (index < len - 1) {
            setActiveOptionIndex(index + 1)
          }
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          if (index > 0) {
            setActiveOptionIndex(index - 1)
          } else {
            setActiveOptionIndex(null)
            requestAnimationFrame(() => searchInputRef.current?.focus())
          }
          return
        }
        if (e.key === 'Home') {
          e.preventDefault()
          if (len > 0) setActiveOptionIndex(0)
          return
        }
        if (e.key === 'End') {
          e.preventDefault()
          if (len > 0) setActiveOptionIndex(len - 1)
        }
      },
      [filteredDialogues, handleItemClick]
    )

    const setOptionRef = useCallback((filename: string, el: HTMLDivElement | HTMLButtonElement | null) => {
      if (el && el instanceof HTMLDivElement && el.getAttribute('role') === 'option') {
        optionElRefs.current.set(filename, el)
      } else {
        optionElRefs.current.delete(filename)
      }
    }, [])

    const activeDialogue = selectedFilename
      ? dialogues.find(
        (d) => normalizeDialogueFilenameKey(d.filename) === normalizeDialogueFilenameKey(selectedFilename)
      ) ?? null
      : null
    const triggerLabel = activeDialogue
      ? getDialogueDisplayTitle(activeDialogue)
      : selectedFilename
        ? formatDialogueTitle(selectedFilename)
        : TRIGGER_LABEL_FALLBACK

    return (
      <div ref={rootRef} style={{ position: 'relative', display: 'inline-flex', minWidth: 0 }}>
        <button
          ref={triggerRef}
          type="button"
          data-testid="dialogue-combobox-trigger"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={isOpen ? panelId : undefined}
          aria-labelledby={triggerLabelId}
          onClick={() => setIsOpen((v) => !v)}
          title={triggerLabel}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.4rem 0.6rem',
            border: `1px solid ${theme.input.border}`,
            borderRadius: '6px',
            backgroundColor: theme.input.background,
            color: theme.input.color,
            fontSize: remSize('small'),
            cursor: 'pointer',
            maxWidth: 240,
            minWidth: 0,
            ...triggerStyle,
          }}
        >
          <span
            id={triggerLabelId}
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
              flex: 1,
            }}
          >
            {triggerLabel}
          </span>
          <span aria-hidden="true" style={{ fontSize: '0.65rem', opacity: 0.8 }}>
            ▼
          </span>
        </button>

        {isOpen && (
          <div
            id={panelId}
            data-testid="dialogue-combobox-panel"
            role="listbox"
            aria-label="Sélection de dialogue"
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              minWidth: 'min(320px, 90vw)',
              maxHeight: 'min(420px, 70vh)',
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '8px',
              backgroundColor: theme.background.panel,
              boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
              zIndex: 1100,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                close()
              }
            }}
          >
            <div
              style={{
                padding: '0.5rem',
                borderBottom: `1px solid ${theme.border.primary}`,
                backgroundColor: theme.background.panelHeader,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.4rem',
                  marginBottom: '0.45rem',
                  alignItems: 'center',
                }}
              >
                <input
                  ref={searchInputRef}
                  data-testid="dialogue-combobox-search"
                  type="text"
                  placeholder="Rechercher… (/)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown' && filteredDialogues.length > 0) {
                      e.preventDefault()
                      setActiveOptionIndex(0)
                    }
                    if (e.key === 'ArrowUp' && filteredDialogues.length > 0) {
                      e.preventDefault()
                      setActiveOptionIndex(filteredDialogues.length - 1)
                    }
                  }}
                  style={{
                    flex: '1 1 120px',
                    minWidth: 0,
                    padding: '0.45rem 0.55rem',
                    fontSize: remSize('body'),
                    border: `1px solid ${theme.input.border}`,
                    borderRadius: '6px',
                    boxSizing: 'border-box',
                    backgroundColor: theme.input.background,
                    color: theme.input.color,
                  }}
                />
                <StyledSelect
                  value={sortType}
                  onChange={(e) => setSortType(e.target.value as typeof sortType)}
                  style={{
                    padding: '0.45rem 0.5rem',
                    border: `1px solid ${theme.input.border}`,
                    borderRadius: '6px',
                    backgroundColor: theme.input.background,
                    color: theme.input.color,
                    fontSize: remSize('small'),
                    flexShrink: 0,
                  }}
                  wrapperStyle={{ width: 'auto', flexShrink: 0 }}
                  title="Trier les dialogues"
                >
                  <option value="date-desc">Date (récent)</option>
                  <option value="date-asc">Date (ancien)</option>
                  <option value="name-asc">Nom (A-Z)</option>
                  <option value="name-desc">Nom (Z-A)</option>
                  <option value="size-desc">Taille (grand)</option>
                  <option value="size-asc">Taille (petit)</option>
                </StyledSelect>
              </div>

              <div
                data-testid="dialogue-combobox-count"
                style={{ fontSize: remSize('small'), color: theme.text.secondary }}
              >
                {filteredCount} dialogue{filteredCount !== 1 ? 's' : ''}
                {searchQuery && ` (sur ${total} total)`}
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
              {isLoading ? (
                <div
                  style={{
                    padding: '0.75rem',
                    textAlign: 'center',
                    fontSize: remSize('body'),
                    color: theme.text.secondary,
                  }}
                >
                  Chargement…
                </div>
              ) : error ? (
                <div
                  style={{
                    padding: '0.75rem',
                    color: theme.state.error.color,
                    backgroundColor: theme.state.error.background,
                    fontSize: remSize('small'),
                  }}
                >
                  {error}
                  <button
                    type="button"
                    onClick={() => void refresh()}
                    style={{
                      marginLeft: '0.5rem',
                      padding: '0.25rem 0.5rem',
                      border: `1px solid ${theme.border.primary}`,
                      borderRadius: '4px',
                      backgroundColor: theme.button.default.background,
                      color: theme.button.default.color,
                      cursor: 'pointer',
                    }}
                  >
                    Réessayer
                  </button>
                </div>
              ) : filteredDialogues.length === 0 ? (
                <div
                  style={{
                    padding: '0.75rem',
                    textAlign: 'center',
                    fontSize: remSize('body'),
                    color: theme.text.secondary,
                  }}
                >
                  {searchQuery ? 'Aucun dialogue trouvé' : 'Aucun dialogue Unity'}
                </div>
              ) : (
                filteredDialogues.map((dialogue, index) => (
                  <UnityDialogueItem
                    key={dialogue.filename}
                    ref={(el) => setOptionRef(dialogue.filename, el)}
                    dialogue={dialogue}
                    onClick={() => handleItemClick(dialogue)}
                    onContextMenu={(e) => handleItemContextMenu(dialogue, e)}
                    isSelected={
                      !!selectedFilename &&
                      normalizeDialogueFilenameKey(selectedFilename) ===
                        normalizeDialogueFilenameKey(dialogue.filename)
                    }
                    searchQuery={searchQuery}
                    asListboxOption
                    optionId={`${panelId}-opt-${index}`}
                    isActiveOption={activeOptionIndex === index}
                    onOptionKeyDown={handleOptionKeyDown(index)}
                  />
                ))
              )}
            </div>
          </div>
        )}
        {contextMenu && (
          <DialogueListContextMenu
            state={contextMenu}
            onClose={() => setContextMenu(null)}
            onSelect={(dialogue) => handleItemClick(dialogue)}
            onDeleted={() => refresh()}
          />
        )}
      </div>
    )
  }
)
