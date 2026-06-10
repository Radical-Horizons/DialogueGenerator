/**
 * Story 17.6 — densité typographique rail segmenté + libellés longs (FR118).
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Tabs } from './Tabs'
import { segmentedTabTypography } from '../../theme/responsiveChrome'

const longLabel =
  'Onglet avec un libellé très long pour forcer la troncature dans un rail étroit sans scroll document'

describe('Tabs variant segmented — colonne étroite vs confortable (17.6)', () => {
  it('réduit fontSize et padding du bouton dans un conteneur étroit vs large', () => {
    const tabs = [
      { id: 'a', label: 'Alpha', content: <div /> },
      { id: 'b', label: 'Beta', content: <div /> },
    ]

    const { unmount } = render(
      <div style={{ width: 320 }}>
        <Tabs variant="segmented" activeTabId="a" onTabChange={() => {}} tabs={tabs} />
      </div>
    )

    const narrowBtn = screen.getByRole('button', { name: 'Alpha' })
    expect(narrowBtn.style.fontSize).toBe(`${segmentedTabTypography.narrow.fontSizeRem}rem`)
    expect(narrowBtn.style.padding).toBe(segmentedTabTypography.narrow.buttonPadding)
    unmount()

    render(
      <div style={{ width: 720 }}>
        <Tabs variant="segmented" activeTabId="a" onTabChange={() => {}} tabs={tabs} />
      </div>
    )

    const comfortableBtn = screen.getByRole('button', { name: 'Alpha' })
    expect(comfortableBtn.style.fontSize).toBe(`${segmentedTabTypography.comfortable.fontSizeRem}rem`)
    expect(comfortableBtn.style.padding).toBe(segmentedTabTypography.comfortable.buttonPadding)
    expect(parseFloat(segmentedTabTypography.comfortable.fontSizeRem.toString())).toBeGreaterThan(
      segmentedTabTypography.narrow.fontSizeRem
    )
  })

  it('plancher narrow : fontSize au moins 0.75rem (≈12px si root 16px)', () => {
    render(
      <div style={{ width: 280 }}>
        <Tabs
          variant="segmented"
          activeTabId="x"
          onTabChange={() => {}}
          tabs={[{ id: 'x', label: 'X', content: <div /> }]}
        />
      </div>
    )
    const btn = screen.getByRole('button', { name: 'X' })
    expect(parseFloat(btn.style.fontSize)).toBeGreaterThanOrEqual(0.75)
  })
})

describe('Tabs variant segmented — libellés longs (17.6 AC2)', () => {
  it('expose le libellé complet sur title et évite le débordement horizontal du document', () => {
    render(
      <div style={{ width: 260 }}>
        <Tabs
          variant="segmented"
          activeTabId="a"
          onTabChange={() => {}}
          tabs={[
            { id: 'a', label: longLabel, content: <div /> },
            { id: 'b', label: 'B', content: <div /> },
          ]}
        />
      </div>
    )

    const tabA = screen.getByRole('button', { name: longLabel })
    expect(tabA).toHaveAttribute('title', longLabel)

    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth + 1
    )
  })
})
