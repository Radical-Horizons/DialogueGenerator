import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ContextList } from './ContextList'
import type { ContextListItem } from './ContextList'

const defaultItems: ContextListItem[] = [
  { name: 'Alice', data: { Résumé: 'Personnage principal.' } },
  { name: 'Bob', data: { Résumé: 'Second personnage.' } },
  { name: 'Charlie', data: {} },
]

const defaultProps = {
  items: defaultItems,
  selectedItems: [] as string[],
  onItemClick: vi.fn(),
  onItemToggle: vi.fn(),
  selectedDetail: null as string | null,
  onSelectDetail: vi.fn(),
  showCheckboxes: true,
}

describe('ContextList', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('affiche la liste des éléments avec nom et aperçu', () => {
    render(<ContextList {...defaultProps} />)

    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('Charlie')).toBeInTheDocument()
    expect(screen.getByText(/Personnage principal\./)).toBeInTheDocument()
    expect(screen.getByText(/Second personnage\./)).toBeInTheDocument()
  })

  it('affiche le champ de recherche avec placeholder', () => {
    render(<ContextList {...defaultProps} />)

    expect(screen.getByPlaceholderText(/rechercher/i)).toBeInTheDocument()
  })

  it('filtre les résultats en temps réel après debounce 300ms', () => {
    render(<ContextList {...defaultProps} />)

    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText(/rechercher/i), { target: { value: 'Ali' } })
    const aliceMatches = screen.getAllByText((_, el) => el?.textContent?.trim() === 'Alice')
    expect(aliceMatches.length).toBeGreaterThanOrEqual(1)
    expect(screen.queryAllByText((_, el) => el?.textContent?.trim() === 'Bob')).toHaveLength(0)
    expect(screen.queryAllByText((_, el) => el?.textContent?.trim() === 'Charlie')).toHaveLength(0)
  })

  it('priorise les résultats de priorityEntityTab pendant une recherche', () => {
    render(
      <ContextList
        {...defaultProps}
        items={[
          { name: 'Taluo', entityTab: 'locations', entityTypeLabel: 'Lieu', data: {} },
          { name: 'Taluan', entityTab: 'characters', entityTypeLabel: 'Personnage', data: {} },
        ]}
        priorityEntityTab="characters"
      />
    )

    fireEvent.change(screen.getByPlaceholderText(/rechercher/i), { target: { value: 'Tal' } })

    const badges = screen.getAllByText(/^(Personnage|Lieu)$/)
    expect(badges[0]).toHaveTextContent('Personnage')
    expect(badges[1]).toHaveTextContent('Lieu')
  })

  it('affiche le badge type en recherche, et le masque dans la liste filtrée', () => {
    // Ecran 1c : la liste est deja filtree par onglet, le type y serait redondant.
    // En recherche, les resultats traversent les categories : le type redevient utile.
    const { rerender } = render(<ContextList {...defaultProps} entityTypeLabel="Personnage" />)
    expect(screen.queryByText('Personnage')).toBeNull()

    rerender(<ContextList {...defaultProps} entityTypeLabel="Personnage" searchQuery="Ali" />)
    expect(screen.getAllByText('Personnage').length).toBeGreaterThanOrEqual(1)
  })

  it('appelle onScrollToBottom quand on scroll près du bas', () => {
    const onScrollToBottom = vi.fn()
    render(
      <ContextList
        {...defaultProps}
        onScrollToBottom={onScrollToBottom}
      />
    )

    const scrollContainer = screen.getByTestId('context-list-scroll')
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 500, configurable: true })
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 200, configurable: true })
    Object.defineProperty(scrollContainer, 'scrollTop', { value: 250, configurable: true })
    scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }))

    expect(onScrollToBottom).toHaveBeenCalled()
  })

  it('affiche un indicateur de chargement quand isLoading est true', () => {
    render(<ContextList {...defaultProps} isLoading />)

    expect(screen.getByText(/chargement/i)).toBeInTheDocument()
    expect(screen.queryByText('Alice')).not.toBeInTheDocument()
  })

  it('affiche "Aucun résultat" quand la recherche ne matche rien', () => {
    render(<ContextList {...defaultProps} />)

    fireEvent.change(screen.getByPlaceholderText(/rechercher/i), { target: { value: 'XyZ inexistant' } })

    expect(screen.getByText(/aucun résultat/i)).toBeInTheDocument()
  })

  it('charge les pages suivantes si la recherche ne matche pas le buffer local', () => {
    const onScrollToBottom = vi.fn()
    const { rerender } = render(
      <ContextList
        {...defaultProps}
        items={[{ name: 'Oeil de Mirimance', data: {} }]}
        onScrollToBottom={onScrollToBottom}
        hasMore
      />
    )

    fireEvent.change(screen.getByPlaceholderText(/rechercher/i), { target: { value: 'Taluo' } })
    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(onScrollToBottom).toHaveBeenCalled()
    expect(screen.getByText(/recherche dans le catalogue/i)).toBeInTheDocument()

    rerender(
      <ContextList
        {...defaultProps}
        items={[
          { name: 'Oeil de Mirimance', data: {} },
          { name: 'Taluo', data: {} },
        ]}
        onScrollToBottom={onScrollToBottom}
        hasMore={false}
      />
    )

    expect(screen.getByText('Taluo')).toBeInTheDocument()
    expect(screen.queryByText(/aucun résultat/i)).not.toBeInTheDocument()
  })

  it('n\'appelle pas onScrollToBottom en boucle si hasMore est false', () => {
    const onScrollToBottom = vi.fn()
    render(
      <ContextList
        {...defaultProps}
        onScrollToBottom={onScrollToBottom}
        hasMore={false}
      />
    )

    fireEvent.change(screen.getByPlaceholderText(/rechercher/i), { target: { value: 'XyZ' } })
    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(onScrollToBottom).not.toHaveBeenCalled()
    expect(screen.getByText(/aucun résultat/i)).toBeInTheDocument()
  })

  it('appelle onItemClick au clic sur un élément', () => {
    const onItemClick = vi.fn()
    render(<ContextList {...defaultProps} onItemClick={onItemClick} />)

    fireEvent.click(screen.getByText('Alice'))

    expect(onItemClick).toHaveBeenCalledWith('Alice', undefined)
  })
})
