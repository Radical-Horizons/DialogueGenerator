/**
 * Inspecteur droit de l'éditeur de graphe (écran 2e).
 *
 * Remplace les panneaux flottants empilables par une colonne fixe de 300 px à onglets :
 * le canvas n'est jamais masqué. Un seul onglet actif à la fois (`uiLayoutStore`).
 *
 * Valeurs relevées dans `docs/design/refonte-ui-2026/etats-2a-2e.dc.html`, bloc `2e`.
 */
import type { CSSProperties, ReactNode } from 'react'
import { theme } from '../../theme'
import {
  redesignAccent,
  redesignFont,
  redesignHairline,
  redesignRadius,
  redesignText,
} from '../../theme/redesignTokens'
import { useUiLayoutStore, type InspectorTab } from '../../store/uiLayoutStore'

/** Largeur fixe de l'inspecteur (2e). */
export const GRAPH_INSPECTOR_WIDTH_PX = 300

export interface GraphInspectorTabDef {
  id: InspectorTab
  label: string
  /** Compteur affiché à droite du libellé (santé) ; masqué si 0 ou absent. */
  count?: number
  /** Couleur du compteur — avertissement par défaut. */
  countColor?: string
  content: ReactNode
}

export interface GraphInspectorProps {
  tabs: GraphInspectorTabDef[]
  /** Bloc d'action en pied (bouton primaire + actions secondaires). */
  footer?: ReactNode
}

const tabBaseStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: '0 0 3px',
  cursor: 'pointer',
  fontFamily: redesignFont.mono,
  fontSize: '10px',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
}

/** Étiquette de rangée + valeur, motif répété dans tous les onglets. */
export function GraphInspectorRow({
  label,
  action,
  children,
}: {
  label: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div
      style={{
        padding: '11px 18px',
        borderTop: `1px solid ${redesignHairline.standard}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <span
          style={{
            fontFamily: redesignFont.mono,
            fontSize: '9.5px',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: redesignText.label,
          }}
        >
          {label}
        </span>
        {action ? (
          <span style={{ fontSize: '12px', color: redesignText.secondary }}>{action}</span>
        ) : null}
      </div>
      <span style={{ fontSize: '12.5px', lineHeight: 1.5, color: redesignText.body }}>
        {children}
      </span>
    </div>
  )
}

/** Phrase d'état vide — le handoff interdit un panneau vide sans explication. */
export function GraphInspectorEmpty({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: '11px 18px' }}>
      <span style={{ fontSize: '12.5px', lineHeight: 1.5, color: redesignText.muted }}>
        {children}
      </span>
    </div>
  )
}

export function GraphInspector({ tabs, footer }: GraphInspectorProps) {
  const inspectorTab = useUiLayoutStore((s) => s.inspectorTab)
  const toggleInspectorTab = useUiLayoutStore((s) => s.toggleInspectorTab)

  const active = tabs.find((t) => t.id === inspectorTab) ?? null

  return (
    <div
      data-testid="graph-inspector"
      style={{
        width: GRAPH_INSPECTOR_WIDTH_PX,
        flexShrink: 0,
        borderLeft: `1px solid ${redesignHairline.standard}`,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          flexShrink: 0,
          padding: '16px 18px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div role="tablist" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {tabs.map((tab) => {
            const isActive = tab.id === inspectorTab
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                data-testid={`graph-inspector-tab-${tab.id}`}
                onClick={() => toggleInspectorTab(tab.id)}
                style={{
                  ...tabBaseStyle,
                  color: isActive ? redesignText.strong : redesignText.label,
                  boxShadow: isActive ? `inset 0 -1px 0 ${redesignAccent.base}` : 'none',
                }}
              >
                {tab.label}
                {tab.count ? (
                  <span style={{ marginLeft: 5, color: tab.countColor ?? theme.state.warning.color }}>
                    {tab.count}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>

      {active ? (
        <div
          data-testid="graph-inspector-content"
          role="tabpanel"
          style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingTop: 12 }}
        >
          {active.content}
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, paddingTop: 12 }}>
          <GraphInspectorEmpty>
            Aucun onglet ouvert. Choisis Nœud, Santé, Qualité ou Coût ci-dessus.
          </GraphInspectorEmpty>
        </div>
      )}

      {footer ? (
        <div
          style={{
            flexShrink: 0,
            borderTop: `1px solid ${redesignHairline.standard}`,
            padding: '14px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 9,
          }}
        >
          {footer}
        </div>
      ) : null}
    </div>
  )
}

/** En-tête de l'onglet NŒUD : id mono + réplique en serif (la ligne qu'on lit). */
export function GraphInspectorNodeHeading({
  nodeLabel,
  line,
}: {
  nodeLabel: string
  line?: string
}) {
  return (
    <div
      style={{
        padding: '0 18px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
      }}
    >
      <span
        style={{
          fontFamily: redesignFont.mono,
          fontSize: '9.5px',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: redesignText.label,
        }}
      >
        {nodeLabel}
      </span>
      {line ? (
        <span
          style={{
            fontFamily: redesignFont.serif,
            fontSize: '14.5px',
            lineHeight: 1.55,
            color: '#f0efe9',
          }}
        >
          {line}
        </span>
      ) : null}
    </div>
  )
}

/** Bouton primaire du pied d'inspecteur (40px, accent, raccourci mono). */
export function GraphInspectorPrimaryAction({
  label,
  shortcut,
  onClick,
  disabled,
}: {
  label: string
  shortcut?: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 40,
        borderRadius: `${redesignRadius.control}px`,
        border: 'none',
        backgroundColor: redesignAccent.base,
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        width: '100%',
      }}
    >
      <span style={{ fontSize: '13.5px', fontWeight: 600 }}>{label}</span>
      {shortcut ? (
        <span
          style={{
            fontFamily: redesignFont.mono,
            fontSize: '10.5px',
            color: 'rgba(255,255,255,0.6)',
          }}
        >
          {shortcut}
        </span>
      ) : null}
    </button>
  )
}
