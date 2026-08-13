/**
 * Sélecteur compact modèle + niveau de raisonnement, posé dans la barre d'action.
 *
 * Ces deux réglages-là se changent en cours d'écriture, les autres non : ils
 * sortent donc du panneau « Réglages du modèle » (qui garde top_p, tokens max et
 * nombre de choix) pour venir contre le bouton « Générer ».
 *
 * Le menu est **porté** (`createPortal`) et s'ouvre vers le haut : la pastille vit
 * en bas d'une colonne défilante, un menu en flux normal serait rogné par le
 * conteneur. Deux niveaux dans un seul popup (liste → « Effort » → retour) plutôt
 * qu'un vrai sous-menu volant : pas de calcul de débordement à droite, et ça reste
 * utilisable à 320 px.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLLMStore } from '../../store/llmStore'
import {
  MODEL_TIER_DESCRIPTIONS,
  REASONING_EFFORT_MODELS,
  REASONING_EFFORT_OPTIONS,
  REASONING_EFFORT_SHORT_LABELS,
} from '../../constants'
import {
  redesignAccent,
  redesignControl,
  redesignDisclosureArrow,
  redesignFont,
  redesignHairline,
  redesignRadius,
  redesignSurface,
  redesignText,
} from '../../theme/redesignTokens'
import type { ReasoningEffort } from '../../types/api'

const MENU_WIDTH = 320
/** Marge entre la pastille et le menu, et entre le menu et le bord de l'écran. */
const MENU_GAP = 6

const PROVIDER_LABELS: Readonly<Record<string, string>> = {
  openai: 'OpenAI',
  mistral: 'Mistral',
  openrouter: 'OpenRouter',
}

function providerLabel(clientType: string): string {
  return PROVIDER_LABELS[clientType] ?? clientType.charAt(0).toUpperCase() + clientType.slice(1)
}

/**
 * Gouttière reprise telle quelle du bouton « × N » voisin : les deux encadrent
 * l'action primaire, un écart de quelques pixels s'y verrait.
 */
const PILL_PADDING_X = 14

export interface ModelEffortPickerProps {
  reasoningEffort: ReasoningEffort | null
  onReasoningEffortChange: (value: ReasoningEffort | null) => void
  /** Vrai pendant une génération : on n'édite pas les réglages du run en cours. */
  disabled?: boolean
  /**
   * Hauteur de la rangée d'action, imposée par l'appelant : la pastille est
   * encadrée par « Générer » et « × N » et doit rester à leur exacte hauteur,
   * y compris en mode écriture où la rangée se tasse.
   */
  height: number
}

export function ModelEffortPicker({
  reasoningEffort,
  onReasoningEffortChange,
  disabled = false,
  height,
}: ModelEffortPickerProps) {
  const model = useLLMStore((s) => s.model)
  const availableModels = useLLMStore((s) => s.availableModels)
  const setModel = useLLMStore((s) => s.setModel)
  const setProvider = useLLMStore((s) => s.setProvider)
  const loadModels = useLLMStore((s) => s.loadModels)

  const [isOpen, setIsOpen] = useState(false)
  const [view, setView] = useState<'models' | 'effort'>('models')
  const [box, setBox] = useState<{ left: number; top: number } | null>(null)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Le panneau « Réglages du modèle » n'est pas forcément monté : la pastille ne
  // peut pas compter sur son ModelSelector pour avoir peuplé le store.
  useEffect(() => {
    loadModels()
  }, [loadModels])

  const supportsEffort = (REASONING_EFFORT_MODELS as readonly string[]).includes(model)
  const currentEffort = reasoningEffort ?? 'none'

  const currentModel = useMemo(
    () => availableModels.find((m) => m.api_identifier === model),
    [availableModels, model]
  )

  const groups = useMemo(() => {
    const byProvider = new Map<string, typeof availableModels>()
    for (const m of availableModels) {
      const list = byProvider.get(m.client_type) ?? []
      list.push(m)
      byProvider.set(m.client_type, list)
    }
    return [...byProvider.entries()]
  }, [availableModels])

  const close = useCallback(() => {
    setIsOpen(false)
    setView('models')
    triggerRef.current?.focus()
  }, [])

  // Position calculée à l'ouverture puis suivie : la barre d'action bouge avec le
  // défilement de la colonne et les changements de largeur (mode écriture, 1024px).
  useLayoutEffect(() => {
    if (!isOpen) return
    const sync = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      const r = trigger.getBoundingClientRect()
      const width = Math.min(MENU_WIDTH, window.innerWidth - MENU_GAP * 2)
      const height = menuRef.current?.offsetHeight ?? 0
      const left = Math.min(
        Math.max(MENU_GAP, r.left),
        Math.max(MENU_GAP, window.innerWidth - width - MENU_GAP)
      )
      // Au-dessus par défaut ; en dessous seulement s'il n'y a vraiment pas la place.
      const fitsAbove = r.top - height - MENU_GAP >= MENU_GAP
      const top = fitsAbove ? r.top - height - MENU_GAP : r.bottom + MENU_GAP
      setBox({ left, top })
    }
    sync()
    window.addEventListener('scroll', sync, true)
    window.addEventListener('resize', sync)
    return () => {
      window.removeEventListener('scroll', sync, true)
      window.removeEventListener('resize', sync)
    }
    // `view` : passer de la liste des modèles à celle des efforts change la hauteur,
    // donc l'ancrage haut du menu.
  }, [isOpen, view])

  useEffect(() => {
    if (!isOpen) return
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setIsOpen(false)
      setView('models')
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      // Escape referme d'abord le sous-niveau, comme un vrai sous-menu.
      if (view === 'effort') setView('models')
      else close()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [isOpen, view, close])

  const triggerLabel = currentModel?.display_name ?? model

  const rowStyle = (selected: boolean): React.CSSProperties => ({
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '7px 12px',
    border: 'none',
    background: selected ? redesignAccent.selectedBg : 'transparent',
    color: redesignText.row,
    cursor: 'pointer',
    textAlign: 'left',
  })

  const hoverable = {
    onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.backgroundColor = redesignHairline.rowHover
    },
    onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>, selected = false) => {
      e.currentTarget.style.backgroundColor = selected ? redesignAccent.selectedBg : 'transparent'
    },
  }

  const menu = (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Modèle et niveau de raisonnement"
      data-testid="model-effort-menu"
      style={{
        position: 'fixed',
        left: box?.left ?? -9999,
        top: box?.top ?? -9999,
        width: Math.min(MENU_WIDTH, window.innerWidth - MENU_GAP * 2),
        maxHeight: '70vh',
        overflowY: 'auto',
        zIndex: 1000,
        backgroundColor: redesignSurface.panel,
        border: `1px solid ${redesignControl.border}`,
        borderRadius: redesignRadius.frame,
        boxShadow: '0 8px 28px rgba(0, 0, 0, 0.5)',
        padding: '5px 0',
        // Sans ancrage mesuré, le menu ne doit pas clignoter en haut à gauche.
        visibility: box ? 'visible' : 'hidden',
      }}
    >
      {view === 'models' && (
        <>
          {groups.length === 0 && (
            <p
              style={{
                margin: 0,
                padding: '10px 12px',
                fontSize: '12.5px',
                color: redesignText.muted,
              }}
            >
              Aucun modèle disponible — vérifier la configuration LLM.
            </p>
          )}

          {groups.map(([clientType, models]) => (
            <div key={clientType}>
              {groups.length > 1 && (
                <div
                  style={{
                    padding: '6px 12px 3px',
                    fontFamily: redesignFont.mono,
                    fontSize: '9.5px',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: redesignText.label,
                  }}
                >
                  {providerLabel(clientType)}
                </div>
              )}
              {models.map((m) => {
                const selected = m.api_identifier === model
                return (
                  <button
                    key={m.api_identifier}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    data-testid={`model-option-${m.api_identifier}`}
                    onClick={() => {
                      setProvider(m.client_type)
                      setModel(m.api_identifier)
                      close()
                    }}
                    onMouseEnter={hoverable.onMouseEnter}
                    onMouseLeave={(e) => hoverable.onMouseLeave(e, selected)}
                    style={rowStyle(selected)}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          display: 'block',
                          fontSize: '13px',
                          color: selected ? redesignText.strong : redesignText.row,
                        }}
                      >
                        {m.display_name}
                      </span>
                      {MODEL_TIER_DESCRIPTIONS[m.api_identifier] && (
                        <span
                          style={{
                            display: 'block',
                            fontSize: '11.5px',
                            color: redesignText.muted,
                            marginTop: 1,
                          }}
                        >
                          {MODEL_TIER_DESCRIPTIONS[m.api_identifier]}
                        </span>
                      )}
                    </span>
                    <span
                      aria-hidden
                      style={{
                        flexShrink: 0,
                        width: 14,
                        color: redesignAccent.base,
                        fontSize: '13px',
                      }}
                    >
                      {selected ? '✓' : ''}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}

          {supportsEffort && (
            <>
              <div
                style={{
                  height: 1,
                  backgroundColor: redesignHairline.standard,
                  margin: '5px 0',
                }}
              />
              <button
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                data-testid="model-effort-submenu-trigger"
                onClick={() => setView('effort')}
                onMouseEnter={hoverable.onMouseEnter}
                onMouseLeave={(e) => hoverable.onMouseLeave(e)}
                style={rowStyle(false)}
              >
                <span style={{ flex: 1, fontSize: '13px' }}>Raisonnement</span>
                <span
                  style={{
                    fontFamily: redesignFont.mono,
                    fontSize: '11.5px',
                    color: redesignText.muted,
                  }}
                >
                  {REASONING_EFFORT_SHORT_LABELS[currentEffort]}
                </span>
                <span
                  aria-hidden
                  style={{
                    fontSize: redesignDisclosureArrow.small,
                    lineHeight: 1,
                    color: redesignText.label,
                  }}
                >
                  ›
                </span>
              </button>
            </>
          )}
        </>
      )}

      {view === 'effort' && (
        <>
          <button
            type="button"
            data-testid="model-effort-submenu-back"
            onClick={() => setView('models')}
            onMouseEnter={hoverable.onMouseEnter}
            onMouseLeave={(e) => hoverable.onMouseLeave(e)}
            style={{ ...rowStyle(false), color: redesignText.label }}
          >
            <span
              aria-hidden
              style={{ fontSize: redesignDisclosureArrow.small, lineHeight: 1 }}
            >
              ‹
            </span>
            <span style={{ fontSize: '13px' }}>Raisonnement</span>
          </button>
          <div
            style={{ height: 1, backgroundColor: redesignHairline.standard, margin: '5px 0' }}
          />
          {REASONING_EFFORT_OPTIONS.map((option) => {
            const selected = option.value === currentEffort
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                data-testid={`effort-option-${option.value}`}
                onClick={() => {
                  onReasoningEffortChange(
                    option.value === 'none' ? null : (option.value as ReasoningEffort)
                  )
                  close()
                }}
                onMouseEnter={hoverable.onMouseEnter}
                onMouseLeave={(e) => hoverable.onMouseLeave(e, selected)}
                style={rowStyle(selected)}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      color: selected ? redesignText.strong : redesignText.row,
                    }}
                  >
                    {option.label}
                  </span>
                  {option.hint && (
                    <span
                      style={{
                        display: 'block',
                        fontSize: '11.5px',
                        color: redesignText.muted,
                        marginTop: 1,
                      }}
                    >
                      {option.hint}
                    </span>
                  )}
                </span>
                <span
                  aria-hidden
                  style={{
                    flexShrink: 0,
                    width: 14,
                    color: redesignAccent.base,
                    fontSize: '13px',
                  }}
                >
                  {selected ? '✓' : ''}
                </span>
              </button>
            )
          })}
        </>
      )}
    </div>
  )

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-testid="model-effort-pill"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        disabled={disabled}
        title="Modèle et niveau de raisonnement"
        onClick={() => {
          setView('models')
          setIsOpen((v) => !v)
        }}
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: `0 ${PILL_PADDING_X}px`,
          borderRadius: redesignRadius.control,
          border: `1px solid ${redesignControl.border}`,
          backgroundColor: 'transparent',
          color: redesignText.row,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          // Rétrécit avant le bouton primaire (le libellé s'ellipse), mais ne
          // grandit jamais : la place revient à « Générer ».
          minWidth: 0,
          flexShrink: 1,
          flexGrow: 0,
        }}
      >
        <span
          style={{
            fontSize: '13px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
          }}
        >
          {triggerLabel}
        </span>
        {supportsEffort && (
          <span
            data-testid="model-effort-pill-effort"
            style={{
              fontFamily: redesignFont.mono,
              fontSize: '11px',
              color: redesignText.muted,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {REASONING_EFFORT_SHORT_LABELS[currentEffort]}
          </span>
        )}
        <span
          aria-hidden
          style={{
            fontSize: redesignDisclosureArrow.small,
            lineHeight: 1,
            color: redesignText.label,
            flexShrink: 0,
          }}
        >
          {isOpen ? '▴' : '▾'}
        </span>
      </button>
      {isOpen && createPortal(menu, document.body)}
    </>
  )
}
