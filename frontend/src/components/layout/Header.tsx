/**
 * Composant Header avec authentification et barre de recherche.
 */
import { useState, useEffect, useRef } from 'react'
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
import { TOUCH_TARGET_MIN_PX } from '../../constants'

export function Header() {
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
      {/* Section gauche : Titre */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
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
      </div>
      
      {/* Recherche : alignée à droite avec Réglages / avatar (écran 1c). */}
      {isAuthenticated && (
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', minWidth: 0 }}>
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
            <span aria-hidden>⌘K</span>
            <span>Rechercher</span>
          </button>
        </div>
      )}
      
      {/* Section droite : Options, Actions, Utilisateur */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.75rem', flexShrink: 1, minWidth: 0, flexWrap: 'wrap' }}>
        {isAuthenticated && user && user.role !== 'guest' && actions.handleGenerate && (
          <>
            <button
              onClick={() => {
                setOptionsModalInitialTab('general')
                setIsOptionsModalOpen(true)
              }}
              style={{
                padding: '0.35rem 0.75rem',
                fontSize: remSize('body'),
                backgroundColor: theme.button.default.background,
                color: theme.button.default.color,
                border: `1px solid ${theme.border.primary}`,
                borderRadius: '4px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                minWidth: TOUCH_TARGET_MIN_PX,
                minHeight: TOUCH_TARGET_MIN_PX,
                boxSizing: 'border-box',
              }}
            >
              Options
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
                padding: '0.35rem 0.75rem',
                fontSize: remSize('body'),
                backgroundColor: theme.button.default.background,
                color: (actions.isLoading || isGraphGenerating || !actions.handleReset)
                  ? theme.text.secondary
                  : theme.button.default.color,
                border: `1px solid ${theme.border.primary}`,
                borderRadius: '4px',
                cursor: (actions.isLoading || isGraphGenerating || !actions.handleReset)
                  ? 'not-allowed'
                  : 'pointer',
                whiteSpace: 'nowrap',
                minWidth: TOUCH_TARGET_MIN_PX,
                minHeight: TOUCH_TARGET_MIN_PX,
                boxSizing: 'border-box',
                opacity: (actions.isLoading || isGraphGenerating || !actions.handleReset) ? 0.6 : 1,
              }}
            >
              Reset
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
                  style={{
                    padding: '0.35rem 0.75rem',
                    fontSize: remSize('body'),
                    backgroundColor: theme.button.default.background,
                    color: theme.button.default.color,
                    border: `1px solid ${theme.border.primary}`,
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    whiteSpace: 'nowrap',
                    minWidth: TOUCH_TARGET_MIN_PX,
                    minHeight: TOUCH_TARGET_MIN_PX,
                    boxSizing: 'border-box',
                  }}
                >
                  Actions
                  <span style={{ fontSize: remSize('caption') }}>▼</span>
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
                width: TOUCH_TARGET_MIN_PX,
                height: TOUCH_TARGET_MIN_PX,
                borderRadius: '50%',
                backgroundColor: theme.button.primary.background,
                color: theme.button.primary.color,
                border: `2px solid ${theme.border.primary}`,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: remSize('body'),
                fontWeight: 'bold',
                transition: 'transform 0.2s, box-shadow 0.2s',
                boxShadow: isUserMenuOpen ? '0 2px 8px rgba(0, 0, 0, 0.3)' : 'none',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)'
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3)'
              }}
              onMouseLeave={(e) => {
                if (!isUserMenuOpen) {
                  e.currentTarget.style.transform = 'scale(1)'
                  e.currentTarget.style.boxShadow = 'none'
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

