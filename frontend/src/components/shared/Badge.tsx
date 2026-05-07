import { forwardRef, type CSSProperties, type ReactNode } from 'react'
import type { BadgeSize, BadgeVariant } from '../../theme/badgeTokens'
import { badgeSpacing, badgeTypography, badgeVariantStyles } from '../../theme/badgeTokens'

export interface BadgeProps {
  variant?: BadgeVariant
  size?: BadgeSize
  icon?: ReactNode
  children?: ReactNode
  title?: string
  style?: CSSProperties
  onClick?: () => void
  'data-testid'?: string
}

export const Badge = forwardRef<HTMLDivElement | HTMLButtonElement, BadgeProps>(function Badge(
  {
    variant = 'neutral',
    size = 'sm',
    icon,
    children,
    title,
    style,
    onClick,
    'data-testid': dataTestId,
  },
  ref
) {
  const typo = badgeTypography[size]
  const spacing = badgeSpacing[size]
  const colors = badgeVariantStyles[variant]
  const clickable = typeof onClick === 'function'

  const baseStyle: CSSProperties = {
    padding: spacing.padding,
    borderRadius: spacing.radius,
    fontSize: `${typo.fontSizeRem}rem`,
    fontWeight: typo.fontWeight,
    lineHeight: typo.lineHeight,
    backgroundColor: colors.backgroundColor,
    color: colors.color,
    border: `1px solid ${colors.border}`,
    display: 'inline-flex',
    alignItems: 'center',
    gap: `${spacing.gapRem}rem`,
    whiteSpace: 'nowrap',
    boxSizing: 'border-box',
    ...(clickable ? { cursor: 'pointer' } : null),
    ...style,
  }

  const content = (
    <>
      {icon != null && <span aria-hidden="true">{icon}</span>}
      {children != null && <span>{children}</span>}
    </>
  )

  if (clickable) {
    return (
      <button
        ref={ref as unknown as React.Ref<HTMLButtonElement>}
        type="button"
        onClick={onClick}
        title={title}
        data-testid={dataTestId}
        style={{
          ...baseStyle,
          margin: 0,
          appearance: 'none',
          WebkitAppearance: 'none',
          fontFamily: 'inherit',
        }}
      >
        {content}
      </button>
    )
  }

  return (
    <div
      ref={ref as unknown as React.Ref<HTMLDivElement>}
      title={title}
      data-testid={dataTestId}
      style={{
        ...baseStyle,
        fontFamily: 'inherit',
      }}
    >
      {content}
    </div>
  )
})

