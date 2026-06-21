import type { CSSProperties, ReactNode } from 'react'
import { theme } from '../../theme'
import { remSize } from '../../theme/uiTypography'
import { Badge } from '../shared'

const ACCORDION_STYLES = `
  .context-panel-accordion-section > summary {
    list-style: none;
  }
  .context-panel-accordion-section > summary::-webkit-details-marker {
    display: none;
  }
  .context-panel-accordion-section > summary .context-panel-chevron {
    display: inline-flex;
    flex-shrink: 0;
    transition: transform 0.15s ease;
    transform: rotate(0deg);
  }
  .context-panel-accordion-section[open] > summary .context-panel-chevron {
    transform: rotate(90deg);
  }
  .context-panel-accordion-group > .context-panel-accordion-section:last-child {
    border-bottom: none;
  }
`

function ChevronRightIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block' }}
    >
      <path
        d="M9 18l6-6-6-6"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ContextPanelAccordionGroup({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{ACCORDION_STYLES}</style>
      <div
        data-testid="context-panel-accordion-group"
        className="context-panel-accordion-group"
        style={{
          flexShrink: 0,
          borderTop: `1px solid ${theme.border.primary}`,
          backgroundColor: theme.background.secondary,
        }}
      >
        {children}
      </div>
    </>
  )
}

export interface ContextPanelAccordionSectionProps {
  title: string
  children: ReactNode
  testId?: string
  summaryTestId?: string
  defaultOpen?: boolean
  /** Style atténué pour sections vides ou inactives. */
  muted?: boolean
  /** Compteur affiché en badge à droite du titre. */
  badgeCount?: number
  bodyStyle?: CSSProperties
}

export function ContextPanelAccordionSection({
  title,
  children,
  testId,
  summaryTestId,
  defaultOpen = false,
  muted = false,
  badgeCount,
  bodyStyle,
}: ContextPanelAccordionSectionProps) {
  return (
    <details
      data-testid={testId}
      className="context-panel-accordion-section"
      open={defaultOpen || undefined}
      style={{
        borderBottom: `1px solid ${theme.border.primary}`,
      }}
    >
      <summary
        data-testid={summaryTestId}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          padding: '0.4rem 0.75rem',
          cursor: 'pointer',
          fontSize: remSize('small'),
          fontWeight: muted ? 500 : 600,
          color: muted ? theme.text.secondary : theme.text.primary,
        }}
      >
        <span className="context-panel-chevron">
          <ChevronRightIcon />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>{title}</span>
        {badgeCount != null && (
          <Badge variant={badgeCount > 0 ? 'info' : 'neutral'} size="sm">
            {badgeCount}
          </Badge>
        )}
      </summary>
      <div
        style={{
          padding: '0 0.75rem 0.5rem',
          ...bodyStyle,
        }}
      >
        {children}
      </div>
    </details>
  )
}
