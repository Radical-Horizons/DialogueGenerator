import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from './Badge'

describe('Badge', () => {
  it('renders a non-clickable badge as a div', () => {
    render(
      <Badge variant="success" size="sm" icon="✓" title="ok">
        Test
      </Badge>
    )
    const el = screen.getByText('Test').closest('div')
    expect(el).not.toBeNull()
    expect(el!).toHaveStyle({ display: 'inline-flex' })
  })

  it('renders a clickable badge as a button with stable typography', () => {
    const onClick = vi.fn()
    render(
      <Badge variant="warning" size="md" icon="⚠" onClick={onClick} title="warn">
        Avertissement
      </Badge>
    )
    const btn = screen.getByRole('button', { name: 'Avertissement' })
    expect(btn).toHaveStyle({ display: 'inline-flex' })
    // Ensure we do not rely on the CSS shorthand `font` (avoids conflicts on rerender).
    expect(btn.getAttribute('style') ?? '').not.toMatch(/\bfont:\s*inherit\b/)
    btn.click()
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

