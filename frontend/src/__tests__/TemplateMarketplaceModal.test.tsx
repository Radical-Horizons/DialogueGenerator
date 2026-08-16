/**
 * Tests du modal marketplace (empty, filtres, utiliser, notation guest/auteur).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TemplateMarketplaceModal } from '../components/generation/TemplateMarketplaceModal'
import type { MarketplaceListing } from '../types/template'

const mockList = vi.fn()
const mockUse = vi.fn()
const mockRate = vi.fn()
const mockUnpublish = vi.fn()
const mockToast = vi.fn()

vi.mock('../api/templates', () => ({
  listMarketplaceTemplatesApi: (...args: unknown[]) => mockList(...args),
  copyMarketplaceListingApi: (...args: unknown[]) => mockUse(...args),
  rateMarketplaceTemplateApi: (...args: unknown[]) => mockRate(...args),
  unpublishMarketplaceListingApi: (...args: unknown[]) => mockUnpublish(...args),
}))

vi.mock('../components/shared', () => ({
  useToast: () => mockToast,
}))

function listing(overrides: Partial<MarketplaceListing> = {}): MarketplaceListing {
  return {
    id: 'listing-1',
    sourceTemplateId: 'tpl-1',
    authorId: 'writer-a',
    authorUsername: 'writer-a',
    name: 'Confrontation publique',
    description: 'Desc publique',
    category: 'Confrontation',
    icon: '⚔️',
    configuration: {
      characters: ['char-alpha'],
      locations: ['loc-alpha'],
      region: '',
      sceneType: 'Generic',
      instructions: 'Brief public',
    },
    createdAt: '2026-08-16T10:00:00Z',
    usageCount: 2,
    ratingAverage: 4,
    ratingCount: 1,
    ...overrides,
  }
}

describe('TemplateMarketplaceModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockList.mockResolvedValue([])
    mockUse.mockResolvedValue({
      ...listing(),
      id: 'copied-1',
      name: 'Confrontation publique (copie)',
      warnings: [],
    })
    mockRate.mockResolvedValue(listing({ ratingAverage: 5, ratingCount: 1 }))
    mockUnpublish.mockResolvedValue(undefined)
  })

  it('affiche l’empty state sans fiche', async () => {
    render(
      <TemplateMarketplaceModal
        isOpen
        onClose={vi.fn()}
        currentUserId="writer-b"
        currentUserRole="writer"
        isGuest={false}
        onCopied={vi.fn()}
      />,
    )

    expect(await screen.findByTestId('marketplace-empty')).toHaveTextContent('Aucune fiche publiée')
  })

  it('filtre par nom, catégorie, contexte (AND) et trie', async () => {
    mockList.mockResolvedValue([
      listing({
        id: 'a',
        name: 'Alpha',
        category: 'Salutation',
        usageCount: 9,
        createdAt: '2026-08-01T00:00:00Z',
        configuration: {
          characters: ['char-alpha'],
          locations: [],
          region: '',
          sceneType: 'Generic',
          instructions: 'Brief A',
        },
      }),
      listing({
        id: 'b',
        name: 'Bravo',
        category: 'Confrontation',
        usageCount: 1,
        createdAt: '2026-08-10T00:00:00Z',
        configuration: {
          characters: ['char-beta'],
          locations: [],
          region: '',
          sceneType: 'Generic',
          instructions: 'Brief B',
        },
      }),
    ])
    render(
      <TemplateMarketplaceModal
        isOpen
        onClose={vi.fn()}
        currentUserId="writer-b"
        currentUserRole="writer"
        isGuest={false}
        onCopied={vi.fn()}
      />,
    )

    expect(await screen.findAllByTestId('marketplace-item')).toHaveLength(2)
    fireEvent.change(screen.getByTestId('marketplace-filter-name'), { target: { value: 'brav' } })
    fireEvent.change(screen.getByTestId('marketplace-filter-category'), {
      target: { value: 'confront' },
    })
    fireEvent.change(screen.getByTestId('marketplace-filter-context'), {
      target: { value: 'char-beta' },
    })
    expect(screen.getAllByTestId('marketplace-item')).toHaveLength(1)
    expect(screen.getByText(/Bravo/)).toBeInTheDocument()

    fireEvent.change(screen.getByTestId('marketplace-filter-name'), { target: { value: '' } })
    fireEvent.change(screen.getByTestId('marketplace-filter-category'), { target: { value: '' } })
    fireEvent.change(screen.getByTestId('marketplace-filter-context'), { target: { value: '' } })
    fireEvent.change(screen.getByTestId('marketplace-sort'), { target: { value: 'usage' } })
    const items = screen.getAllByTestId('marketplace-item')
    expect(items[0]).toHaveAttribute('data-listing-id', 'a')
  })

  it('copie via Utiliser et masque Noter/Retirer pour un guest', async () => {
    const onCopied = vi.fn().mockResolvedValue(undefined)
    mockList.mockResolvedValue([listing()])
    render(
      <TemplateMarketplaceModal
        isOpen
        onClose={vi.fn()}
        currentUserId="guest"
        currentUserRole="guest"
        isGuest
        onCopied={onCopied}
      />,
    )

    fireEvent.click(await screen.findByTestId('marketplace-item'))
    expect(screen.queryByTestId('marketplace-rate-5')).not.toBeInTheDocument()
    expect(screen.queryByTestId('marketplace-unpublish-btn')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('marketplace-use-btn'))
    await waitFor(() => expect(mockUse).toHaveBeenCalledWith('listing-1'))
    expect(onCopied).toHaveBeenCalled()
  })

  it('note une fiche d’un autre writer et retire la sienne', async () => {
    mockList.mockResolvedValue([listing()])
    const { rerender } = render(
      <TemplateMarketplaceModal
        isOpen
        onClose={vi.fn()}
        currentUserId="writer-a"
        currentUserRole="writer"
        isGuest={false}
        onCopied={vi.fn()}
      />,
    )
    fireEvent.click(await screen.findByTestId('marketplace-item'))
    expect(screen.queryByTestId('marketplace-rate-5')).not.toBeInTheDocument()
    expect(screen.getByTestId('marketplace-unpublish-btn')).toBeInTheDocument()

    rerender(
      <TemplateMarketplaceModal
        isOpen
        onClose={vi.fn()}
        currentUserId="writer-b"
        currentUserRole="writer"
        isGuest={false}
        onCopied={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId('marketplace-item'))
    fireEvent.click(screen.getByTestId('marketplace-rate-5'))
    await waitFor(() =>
      expect(mockRate).toHaveBeenCalledWith('listing-1', { stars: 5 }),
    )
  })
})
