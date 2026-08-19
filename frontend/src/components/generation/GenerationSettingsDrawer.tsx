/**
 * Tiroir « Réglages de génération » — pied de la colonne d'entrée.
 *
 * Rassemble tout ce qui décrit **comment le LLM se comporte** : modèle et budgets
 * (passés en `children` par `GenerationPanel`), profil d'auteur, règles du jeu et
 * prompt système. Ces trois derniers étaient des onglets à égalité avec le brief —
 * cliquer dessus effaçait la surface d'écriture sans prévenir.
 *
 * Le partage n'est pas « fréquent vs rare » mais **entrée vs comportement** : les
 * onglets sont ce qu'on rédige, ce tiroir est la façon dont la machine le traite.
 */
import type { ReactNode } from 'react'
import { AuthorProfilePanel } from './AuthorProfilePanel'
import { GameRulesPanel } from './GameRulesPanel'
import { SystemPromptPanel } from './SystemPromptPanel'
import { theme } from '../../theme'
import { redesignDisclosureArrow, redesignFont, redesignHairline, redesignText } from '../../theme/redesignTokens'
import { remSize } from '../../theme/uiTypography'

export interface GenerationSettingsDrawerProps {
  /** Le tiroir est-il déplié ? */
  open: boolean
  onToggle: () => void
  /** Résumé une ligne affiché replié (modèle, effort, budgets). */
  summary: string
  /** Réglages de modèle, fournis par le parent qui en détient l'état. */
  children: ReactNode
  authorProfile: string
  onAuthorProfileChange: (value: string) => void
  gameRules: string
  onGameRulesChange: (value: string) => void
  systemPromptOverride: string | null
  onSystemPromptChange: (value: string | null) => void
}

/** Section repliée du tiroir : un `<details>` natif, pas d'état à porter. */
function DrawerSection({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <details style={{ borderTop: `1px solid ${redesignHairline.standard}` }}>
      <summary
        style={{
          cursor: 'pointer',
          padding: '9px 0',
          fontSize: '13px',
          color: theme.text.primary,
          display: 'flex',
          alignItems: 'baseline',
          gap: 9,
        }}
      >
        {title}
        {hint ? (
          <span style={{ fontFamily: redesignFont.mono, fontSize: '11px', color: redesignText.muted }}>
            {hint}
          </span>
        ) : null}
      </summary>
      <div style={{ paddingBottom: 14 }}>{children}</div>
    </details>
  )
}

export function GenerationSettingsDrawer({
  open,
  onToggle,
  summary,
  children,
  authorProfile,
  onAuthorProfileChange,
  gameRules,
  onGameRulesChange,
  systemPromptOverride,
  onSystemPromptChange,
}: GenerationSettingsDrawerProps) {
  return (
    <div data-testid="generation-settings-drawer" style={{ marginBottom: '1rem' }}>
      <button
        type="button"
        onClick={onToggle}
        data-testid="model-settings-summary-toggle"
        aria-expanded={open}
        aria-controls="generation-settings-body"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.4rem 0',
          background: 'none',
          border: 'none',
          borderTop: `1px solid ${redesignHairline.strong}`,
          cursor: 'pointer',
          color: theme.text.secondary,
          fontFamily: redesignFont.mono,
          fontSize: remSize('small'),
          width: '100%',
          textAlign: 'left',
        }}
      >
        <span style={{ color: theme.text.tertiary }}>Réglages de génération</span>
        <span style={{ color: theme.text.primary }}>{summary}</span>
        <span
          aria-hidden
          style={{
            marginLeft: 'auto',
            color: theme.text.tertiary,
            fontSize: redesignDisclosureArrow.small,
            lineHeight: 1,
          }}
        >
          {open ? '▴' : '▾'}
        </span>
      </button>

      <div
        id="generation-settings-body"
        data-testid="generation-settings-body"
        style={{ display: open ? 'block' : 'none' }}
      >
        {children}

        <DrawerSection title="Profil d'auteur" hint="voix persistante du projet">
          <AuthorProfilePanel
            authorProfile={authorProfile}
            onAuthorProfileChange={onAuthorProfileChange}
          />
        </DrawerSection>

        <DrawerSection title="Règles du jeu" hint="contraintes systémiques">
          <GameRulesPanel gameRules={gameRules} onGameRulesChange={onGameRulesChange} />
        </DrawerSection>

        <DrawerSection title="Prompt système" hint="zone avancée">
          <SystemPromptPanel
            systemPromptOverride={systemPromptOverride}
            onSystemPromptChange={onSystemPromptChange}
          />
        </DrawerSection>
      </div>
    </div>
  )
}
