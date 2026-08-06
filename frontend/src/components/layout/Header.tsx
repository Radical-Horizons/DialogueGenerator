/**
 * Composant Header avec authentification et barre de recherche.
 */
import { useState, useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useCommandPalette } from '../../hooks/useCommandPalette'
import { useGenerationActionsStore } from '../../store/generationActionsStore'
import { useGraphStore } from '../../store/graphStore'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { GenerationOptionsModal } from '../generation/GenerationOptionsModal'
import { ChangePasswordModal } from '../auth/ChangePasswordModal'
import { UnityBatchExportActionsMenuItems } from '../unityDialogues/UnityBatchExportActionsMenuItems'
import { useUnityBatchExportMenuStore } from '../../store/unityBatchExportMenuStore'
import { theme } from '../../theme'
import { remSize } from '../../theme/uiTypography'
import { redesignAccent, redesignFont, redesignText } from '../../theme/redesignTokens'
import { useGenerationElapsed } from '../../hooks/useGenerationRunState'
import { useUiLayoutStore } from '../../store/uiLayoutStore'
import type { CenterPanelTab } from '../../store/uiLayoutStore'
import { TOUCH_TARGET_MIN_PX } from '../../constants'
import { formatShortcut } from '../../utils/platformShortcut'

/** Nom de l'animation du point de génération (déclarée localement, pas de CSS global). */
const HEADER_BLINK_ANIMATION = 'header-generation-blink'

/** Sections de la barre supérieure, dans l'ordre de la maquette. */
const SECTION_NAV_ITEMS: ReadonlyArray<{ id: CenterPanelTab; label: string }> = [
  { id: 'generation', label: 'Générer' },
  { id: 'edition', label: 'Éditer' },
  { id: 'graph', label: 'Graphe' },
]

/**
 * Libellé de la barre supérieure (écran 1c) : mono, capitales, sans contour.
 * La cible de touche reste à `TOUCH_TARGET_MIN_PX` via le padding vertical,
 * sans que le contrôle se voie pour autant.
 */
const headerMonoLinkStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  // FR119 : le libellé est discret, la cible reste tactile.
  minHeight: TOUCH_TARGET_MIN_PX,
  minWidth: TOUCH_TARGET_MIN_PX,
  boxSizing: 'border-box',
  padding: '0 0.25rem',
  backgroundColor: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontFamily: redesignFont.mono,
  fontSize: '10.5px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: redesignText.label,
  whiteSpace: 'nowrap',
}

export function Header() {
  const generationElapsed = useGenerationElapsed()
  const writingMode = useUiLayoutStore((s) => s.writingMode)
  const centerPanelTab = useUiLayoutStore((s) => s.centerPanelTab)
  const setCenterPanelTab = useUiLayoutStore((s) => s.setCenterPanelTab)
  const { user, isAuthenticated, logout } = useAuthStore()
  const navigate = useNavigate()
  const commandPalette = useCommandPalette()
  const { actions } = useGenerationActionsStore()
  const { isGenerating: isGraphGenerating } = useGraphStore()
  const unityBatchExportMenu = useUnityBatchExportMenuStore((s) => s.menu)
  
  const [isOptionsModalOpen, setIsOptionsModalOpen] = useState(false)
  const [optionsModalInitialTab, setOptionsModalInitialTab] = useState<
    | 'context'
    | 'metadata'
    | 'general'
    | 'vocabulary'
    | 'gdd_notion'
    | 'prompts'
    | 'shortcuts'
    | 'usage'
    | 'logs'
  >('general')
  const [isActionsDropdownOpen, setIsActionsDropdownOpen] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false)
  const actionsDropdownRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)

  // Fermer les dropdowns quand on clique ailleurs
  useEffect(() => {
    const handleClickOutside = (event: Event) => {
      const t = event.target as Node
      if (actionsDropdownRef.current && !actionsDropdownRef.current.contains(t)) {
        setIsActionsDropdownOpen(false)
      }
      if (userMenuRef.current && !userMenuRef.current.contains(t)) {
        setIsUserMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('pointerdown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('pointerdown', handleClickOutside)
    }
  }, [])

  const handleLogout = async () => {
    await logout()
  }

  const handleSearchClick = () => {
    commandPalette.open()
  }

  // Raccourci clavier pour ouvrir les options
  useKeyboardShortcuts(
    [
      {
        key: 'ctrl+,',
        handler: () => {
          if (isAuthenticated && user && actions.handleGenerate) {
            setOptionsModalInitialTab('general')
            setIsOptionsModalOpen(true)
          }
        },
        description: 'Ouvrir les options',
      },
    ],
    [isAuthenticated, user, actions.handleGenerate]
  )

  return (
    <header style={{ 
      padding: '0.4rem 1rem', 
      borderBottom: `1px solid ${theme.border.primary}`, 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center',
      flexWrap: 'wrap',
      rowGap: '0.5rem',
      backgroundColor: theme.background.secondary,
      gap: '1rem',
      position: 'relative',
      minWidth: 0,
      width: '100%',
      boxSizing: 'border-box',
    }}>
      {/* Section gauche : Titre + navigation.
          `flex: 1` valait `flex: 1 1 0%` : l'espace se repartissait 50/50 avec le
          bloc droit sans regarder le contenu, et la navigation debordait sur la
          recherche. Base `auto` + `wrap` : elle prend ce qu'il lui faut, et passe
          a la ligne plutot que de chevaucher. */}
      <div
        style={{
          flex: '0 1 auto',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          rowGap: '0.35rem',
          flexWrap: 'wrap',
          minWidth: 0,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontFamily: redesignFont.serif,
            fontSize: '19px',
            fontWeight: 400,
            whiteSpace: 'nowrap',
            letterSpacing: '-0.01em',
          }}
        >
          <Link
            to="/"
            data-testid="header-home-link"
            aria-label="Accueil DialogueGenerator"
            style={{
              color: theme.text.primary,
              textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            Dialogue
            <span style={{ color: redesignAccent.base, fontStyle: 'italic' }}>Generator</span>
          </Link>
        </h1>
        {user?.role === 'guest' && (
          <span
            data-testid="guest-mode-banner"
            role="status"
            style={{
              fontFamily: redesignFont.mono,
              fontSize: '10px',
              letterSpacing: '0.09em',
              textTransform: 'uppercase',
              color: redesignText.label,
              whiteSpace: 'nowrap',
            }}
          >
            Invité — lecture seule
          </span>
        )}
        {/* Horodatage de build : en info-bulle seulement, il n'a pas sa place dans le chrome. */}
        <span
          title={`Date de compilation : ${new Date(__BUILD_DATE__).toLocaleString('fr-FR')}`}
          aria-hidden
          style={{
            width: 4,
            height: 4,
            borderRadius: '50%',
            backgroundColor: redesignText.label,
            flexShrink: 0,
          }}
        />

        {/* Écran 1c : la navigation applicative suit le logo dans la barre
            supérieure. La section active est soulignée à l'accent, pas encadrée.
            2c : elle s'efface avec le reste du chrome — on écrit, on ne navigue pas. */}
        {isAuthenticated && !writingMode && (
          <nav
            data-testid="header-section-nav"
            aria-label="Sections"
            style={{ display: 'flex', gap: 20, flexShrink: 0, marginLeft: 4 }}
          >
            {SECTION_NAV_ITEMS.map((item) => {
              const active = centerPanelTab === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`header-section-${item.id}`}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setCenterPanelTab(item.id)}
                  style={{
                    border: 'none',
                    background: 'none',
                    padding: '0 0 2px',
                    // FR119 : cible tactile conservée malgré le libellé nu.
                    minHeight: TOUCH_TARGET_MIN_PX,
                    minWidth: TOUCH_TARGET_MIN_PX,
                    boxSizing: 'border-box',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: active ? theme.text.primary : redesignText.secondary,
                    boxShadow: active ? `inset 0 -1px 0 ${redesignAccent.base}` : 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.label}
                </button>
              )
            })}
          </nav>
        )}
      </div>
      
      {/* Recherche : alignée à droite avec Réglages / avatar (écran 1c). */}
      {isAuthenticated && !writingMode && (
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          {/* Écran 1c : la recherche est un libellé mono, pas un champ. */}
          <button
            type="button"
            onClick={handleSearchClick}
            aria-label="Rechercher une action, un personnage, un lieu"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              minHeight: TOUCH_TARGET_MIN_PX,
              boxSizing: 'border-box',
              padding: '0 0.25rem',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: redesignFont.mono,
              fontSize: '10.5px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: redesignText.label,
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = theme.text.secondary
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = redesignText.label
            }}
          >
            <span aria-hidden>{formatShortcut('ctrl+k')}</span>
            <span>Rechercher</span>
          </button>
        </div>
      )}
      
      {/* 2c : le chrome applicatif s'efface — il ne reste que le repère de scène
          et le rappel du mode, cliquable pour en sortir. */}
      {writingMode && (
        <div
          data-testid="header-writing-mode"
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '0.9rem',
            minWidth: 0,
          }}
        >
          <button
            type="button"
            onClick={() => useUiLayoutStore.getState().setWritingMode(false)}
            title="Quitter le mode écriture"
            style={{
              border: 'none',
              background: 'none',
              padding: 0,
              cursor: 'pointer',
              fontFamily: redesignFont.mono,
              fontSize: '10px',
              letterSpacing: '0.06em',
              color: redesignText.label,
              whiteSpace: 'nowrap',
            }}
          >
            MODE ÉCRITURE · CTRL+\ POUR SORTIR
          </button>
        </div>
      )}

      {/* Section droite : Reglages, Actions, Utilisateur.
          Meme correctif que le bloc gauche : base `auto`, sinon le contenu deborde
          par-dessus la navigation en dessous de ~400 px. */}
      <div style={{ flex: '1 1 auto', display: writingMode ? 'none' : 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.75rem', minWidth: 0, flexWrap: 'wrap' }}>
        {/* Écran 2a : point clignotant + compteur du run — l'attente a une durée visible. */}
        {generationElapsed && (
          <span
            data-testid="header-generation-timer"
            style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}
          >
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: redesignAccent.base,
                animation: `${HEADER_BLINK_ANIMATION} 1.1s steps(1, end) infinite`,
              }}
            />
            <span
              style={{
                fontFamily: redesignFont.mono,
                fontSize: '10.5px',
                letterSpacing: '0.06em',
                color: '#8fb0ff',
                whiteSpace: 'nowrap',
              }}
            >
              GÉNÉRATION · {generationElapsed}
            </span>
            <style>{`@keyframes ${HEADER_BLINK_ANIMATION} { 50% { opacity: 0; } }`}</style>
          </span>
        )}
        {isAuthenticated && user && user.role !== 'guest' && actions.handleGenerate && (
          <>
            {/* Écran 1c : la barre supérieure ne porte aucun bouton encadré —
                seulement des libellés mono. « Réinitialiser » n'est pas dans la
                maquette mais reste la seule sortie vers un dialogue vierge :
                il prend le même format discret plutôt que de disparaître. */}
            <button
              onClick={() => {
                setOptionsModalInitialTab('general')
                setIsOptionsModalOpen(true)
              }}
              style={{ ...headerMonoLinkStyle }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = theme.text.secondary
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = redesignText.label
              }}
            >
              Réglages
            </button>

            {/* Reset direct : évite un menu Actions à une seule entrée */}
            <button
              type="button"
              data-testid="header-reset-button"
              onClick={() => {
                if (actions.handleReset) {
                  actions.handleReset()
                }
              }}
              disabled={actions.isLoading || isGraphGenerating || !actions.handleReset}
              title="Nouveau dialogue (réinitialiser)"
              style={{
                ...headerMonoLinkStyle,
                cursor: (actions.isLoading || isGraphGenerating || !actions.handleReset)
                  ? 'not-allowed'
                  : 'pointer',
                opacity: (actions.isLoading || isGraphGenerating || !actions.handleReset) ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (!e.currentTarget.disabled) e.currentTarget.style.color = theme.text.secondary
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = redesignText.label
              }}
            >
              Réinitialiser
            </button>

            {/* Actions uniquement s'il y a des exports batch à proposer */}
            {unityBatchExportMenu && (
              <div
                ref={actionsDropdownRef}
                style={{
                  position: 'relative',
                  display: 'inline-block',
                }}
              >
                <button
                  data-testid="header-actions-dropdown"
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsActionsDropdownOpen(!isActionsDropdownOpen)
                  }}
                  style={{ ...headerMonoLinkStyle, gap: '0.3rem' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = theme.text.secondary
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = redesignText.label
                  }}
                >
                  Actions
                  <span aria-hidden style={{ fontSize: '8px' }}>▼</span>
                </button>
                {isActionsDropdownOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 0.25rem)',
                      right: 0,
                      backgroundColor: theme.background.panel,
                      border: `1px solid ${theme.border.primary}`,
                      borderRadius: '4px',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                      zIndex: 1000,
                      minWidth: '220px',
                    }}
                  >
                    <UnityBatchExportActionsMenuItems
                      batch={unityBatchExportMenu}
                      onClose={() => setIsActionsDropdownOpen(false)}
                    />
                  </div>
                )}
              </div>
            )}
          </>
        )}
        
        {isAuthenticated && user && user.role !== 'guest' ? (
          <div
            ref={userMenuRef}
            style={{
              position: 'relative',
              display: 'inline-block',
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation()
                setIsUserMenuOpen(!isUserMenuOpen)
              }}
              aria-label={`Menu utilisateur ${user.username}`}
              aria-expanded={isUserMenuOpen}
              aria-haspopup="menu"
              style={{
                // Écran 1c : pastille cerclée, initiale à l'accent — le seul
                // aplat bleu de l'écran reste le bouton Générer.
                width: TOUCH_TARGET_MIN_PX,
                height: TOUCH_TARGET_MIN_PX,
                borderRadius: '50%',
                backgroundColor: 'transparent',
                color: redesignAccent.base,
                border: `1px solid ${theme.button.default.border}`,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11.5px',
                fontWeight: 600,
                transition: 'border-color 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = redesignAccent.base
              }}
              onMouseLeave={(e) => {
                if (!isUserMenuOpen) {
                  e.currentTarget.style.borderColor = theme.button.default.border
                }
              }}
              title={user.username}
            >
              {user.username ? user.username.charAt(0).toUpperCase() : '?'}
            </button>
            {isUserMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 0.5rem)',
                  right: 0,
                  backgroundColor: theme.background.panel,
                  border: `1px solid ${theme.border.primary}`,
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                  zIndex: 1000,
                  minWidth: '200px',
                  padding: '0.75rem',
                }}
              >
                <div
                  style={{
                    padding: '0.5rem 0.75rem',
                    borderBottom: `1px solid ${theme.border.primary}`,
                    marginBottom: '0.5rem',
                  }}
                >
                  <div style={{ color: theme.text.secondary, fontSize: remSize('small'), marginBottom: '0.25rem' }}>
                    Connecté en tant que
                  </div>
                  <div style={{ color: theme.text.primary, fontSize: remSize('body'), fontWeight: 'bold' }}>
                    {user.username}
                  </div>
                </div>
                {user.role === 'admin' && user.is_active && (
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      setIsUserMenuOpen(false)
                      navigate('/admin')
                    }}
                    style={{
                      width: '100%',
                      minHeight: TOUCH_TARGET_MIN_PX,
                      marginBottom: '0.5rem',
                      padding: '0.5rem 0.75rem',
                      fontSize: remSize('body'),
                      backgroundColor: theme.button.default.background,
                      color: theme.button.default.color,
                      border: `1px solid ${theme.border.primary}`,
                      borderRadius: '4px',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    Administration
                  </button>
                )}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    setIsUserMenuOpen(false)
                    setIsChangePasswordOpen(true)
                  }}
                  style={{
                    width: '100%',
                    minHeight: TOUCH_TARGET_MIN_PX,
                    marginBottom: '0.5rem',
                    padding: '0.5rem 0.75rem',
                    fontSize: remSize('body'),
                    backgroundColor: theme.button.default.background,
                    color: theme.button.default.color,
                    border: `1px solid ${theme.border.primary}`,
                    borderRadius: '4px',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  Changer mon mot de passe
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsUserMenuOpen(false)
                    handleLogout()
                  }}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    fontSize: remSize('body'),
                    backgroundColor: theme.button.default.background,
                    color: theme.button.default.color,
                    border: `1px solid ${theme.border.primary}`,
                    borderRadius: '4px',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = theme.background.secondary
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = theme.button.default.background
                  }}
                >
                  Déconnexion
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            data-testid="header-login-button"
            onClick={() => navigate('/login')}
            style={{
              minHeight: TOUCH_TARGET_MIN_PX,
              minWidth: TOUCH_TARGET_MIN_PX,
              padding: '0.5rem 1rem',
              fontSize: remSize('body'),
              fontWeight: 600,
              backgroundColor: theme.button.primary.background,
              color: theme.button.primary.color,
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Connexion
          </button>
        )}
      </div>
      
      {/* Modal Options */}
      <GenerationOptionsModal
        isOpen={isOptionsModalOpen}
        onClose={() => setIsOptionsModalOpen(false)}
        initialTab={optionsModalInitialTab}
      />
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />
    </header>
  )
}

