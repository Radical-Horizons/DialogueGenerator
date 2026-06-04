/**
 * Comparaison hauteurs onglets : panneau Contexte GDD vs Tabs segmentés (drawer Détails).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Tabs } from '../components/shared/Tabs'
import { ContextSelector } from '../components/context/ContextSelector'
import { contextGddTabChrome } from '../theme/responsiveChrome'
import * as contextAPI from '../api/context'
import { useContextStore } from '../store/contextStore'

vi.mock('../api/context')
vi.mock('../store/contextStore')
vi.mock('../components/context/ContextSuggestionsPanel', () => ({
  ContextSuggestionsPanel: () => null,
}))

const DRAWER_WIDTH_PX = 420

function renderSegmentedTabsNarrow() {
  return render(
    <div style={{ width: DRAWER_WIDTH_PX }} data-testid="seg-host">
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
    </div>,
  )
}

describe('hauteur onglets GDD vs segmented (drawer narrow)', () => {
  beforeEach(() => {
    vi.mocked(useContextStore).mockReturnValue({
      selections: {
        characters_full: [],
        characters_excerpt: [],
        locations_full: [],
        locations_excerpt: [],
        items_full: [],
        items_excerpt: [],
        species_full: [],
        species_excerpt: [],
        communities_full: [],
        communities_excerpt: [],
        dialogues_examples: [],
      },
      toggleCharacter: vi.fn(),
      toggleLocation: vi.fn(),
      toggleItem: vi.fn(),
      toggleSpecies: vi.fn(),
      toggleCommunity: vi.fn(),
      clearSelections: vi.fn(),
      setElementLists: vi.fn(),
      getElementMode: vi.fn(() => null),
      setElementMode: vi.fn(),
      setSuggestions: vi.fn(),
      refreshSuggestionsForTrigger: vi.fn(),
      isElementSelected: vi.fn(() => false),
      suggestions: [],
      gddDataRevision: 0,
    } as ReturnType<typeof useContextStore>)

    vi.mocked(contextAPI.listCharacters).mockResolvedValue({
      characters: [],
      total: 0,
      page: 1,
      page_size: 50,
      total_pages: 1,
    })
    vi.mocked(contextAPI.listLocations).mockResolvedValue({
      locations: [],
      total: 0,
      page: 1,
      page_size: 50,
      total_pages: 1,
    })
    vi.mocked(contextAPI.listItems).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 50,
      total_pages: 1,
    })
    vi.mocked(contextAPI.listSpecies).mockResolvedValue({ species: [], total: 0 })
    vi.mocked(contextAPI.listCommunities).mockResolvedValue({
      communities: [],
      total: 0,
      page: 1,
      page_size: 50,
      total_pages: 1,
    })
  })

  it('onglets GDD balanced et Détails drawer-aligned partagent la même minHeight (~420px)', async () => {
    renderSegmentedTabsNarrow()

    const { container } = render(
      <div style={{ width: DRAWER_WIDTH_PX }} data-testid="gdd-host">
        <ContextSelector />
      </div>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^personnages$/i })).toBeInTheDocument()
    })

    const segPrompt = screen.getByRole('button', { name: /^prompt$/i })
    const gddPersonnages = screen.getByRole('button', { name: /^personnages$/i })

    const tabBar = container.querySelector('[data-context-gdd-tab-density]')
    const density = tabBar?.getAttribute('data-context-gdd-tab-density') ?? 'unknown'
    const tierMin = contextGddTabChrome[density === 'tight' ? 'tight' : 'balanced'].tabMinHeightPx

    const expectedMin = `${contextGddTabChrome.balanced.tabMinHeightPx}px`
    expect(segPrompt.style.minHeight).toBe(expectedMin)
    expect(gddPersonnages.style.minHeight).toBe(expectedMin)
    expect(tierMin).toBe(contextGddTabChrome.balanced.tabMinHeightPx)
  })
})
