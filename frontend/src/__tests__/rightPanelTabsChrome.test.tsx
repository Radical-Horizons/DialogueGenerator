/**
 * Régression : panneau droit desktop doit utiliser drawer-aligned (pas le rail touch 44px).
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Tabs } from '../components/shared/Tabs'
import { drawerPanelTabChrome } from '../theme/responsiveChrome'

const RIGHT_PANEL_WIDTH_PX = 420

describe('right panel tab chrome', () => {
  it('drawer-aligned n’impose pas min-height 44px (rail touch narrow)', () => {
    render(
      <div style={{ width: RIGHT_PANEL_WIDTH_PX }}>
        <Tabs
          variant="segmented"
          segmentedSize="drawer-aligned"
          tabs={[
            { id: 'prompt', label: 'Prompt', content: null },
            { id: 'dialogue', label: 'Dialogue généré', content: null },
            { id: 'details', label: 'Détails', content: null },
          ]}
          activeTabId="prompt"
          onTabChange={() => {}}
        />
      </div>
    )

    const promptTab = screen.getByRole('button', { name: /^prompt$/i })
    expect(promptTab.style.minHeight).toBe(`${drawerPanelTabChrome.tabMinHeightPx}px`)
    expect(promptTab.style.minHeight).not.toBe('44px')
    expect(promptTab.style.padding).toBe(drawerPanelTabChrome.tabPadding)
  })

  it('sans drawer-aligned, colonne étroite retombe sur le rail touch 44px', () => {
    render(
      <div style={{ width: RIGHT_PANEL_WIDTH_PX }}>
        <Tabs
          variant="segmented"
          tabs={[
            { id: 'prompt', label: 'Prompt', content: null },
            { id: 'dialogue', label: 'Dialogue généré', content: null },
          ]}
          activeTabId="prompt"
          onTabChange={() => {}}
        />
      </div>
    )

    const promptTab = screen.getByRole('button', { name: /^prompt$/i })
    expect(promptTab.style.minHeight).toBe('44px')
  })
})
