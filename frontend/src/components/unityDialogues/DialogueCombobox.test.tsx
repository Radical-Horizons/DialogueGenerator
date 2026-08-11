/**
 * Tests du composant `DialogueCombobox` (Story 17.7).
 *
 * Couvre : ouverture / fermeture, recherche, tri (`StyledSelect` réordonne la liste),
 * sélection, raccourci `/` (panneau ouvert ou fermé), clic extérieur,
 * navigation clavier (↑/↓/Home/End/Enter), `role="option"` + `aria-selected`,
 * accessibilité ARIA (`role="combobox"`, `aria-expanded`), ouverture **Enter/Espace**
 * sur le déclencheur fermé (AC #6), `refresh()` via ref,
 * focus sur le déclencheur après fermeture.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRef } from 'react'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as unityDialoguesAPI from '../../api/unityDialogues'
import { DialogueCombobox, type DialogueComboboxRef } from './DialogueCombobox'

vi.mock('../../api/unityDialogues', () => ({
  listUnityDialogues: vi.fn(),
}))

const mockList = vi.mocked(unityDialoguesAPI.listUnityDialogues)

const FIXTURE = [
  {
    filename: 'alpha.json',
    file_path: '/data/alpha.json',
    size_bytes: 1024,
    modified_time: '2026-04-01T08:00:00.000Z',
    title: 'Alpha Story',
  },
  {
    filename: 'bravo.json',
    file_path: '/data/bravo.json',
    size_bytes: 2048,
    modified_time: '2026-04-10T12:00:00.000Z',
    title: 'Bravo Tale',
  },
] as const

describe('DialogueCombobox', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockList.mockResolvedValue({ dialogues: [...FIXTURE], total: FIXTURE.length })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('rend un déclencheur ARIA combobox fermé par défaut', async () => {
    render(<DialogueCombobox selectedFilename={null} onSelect={vi.fn()} />)

    const trigger = await screen.findByTestId('dialogue-combobox-trigger')
    expect(trigger).toHaveAttribute('role', 'combobox')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox')
    expect(screen.queryByTestId('dialogue-combobox-panel')).not.toBeInTheDocument()
  })

  it('affiche le titre du dialogue actif sur le déclencheur', async () => {
    render(<DialogueCombobox selectedFilename="bravo.json" onSelect={vi.fn()} />)

    const trigger = await screen.findByTestId('dialogue-combobox-trigger')
    await waitFor(() => {
      expect(trigger).toHaveTextContent('Bravo Tale')
    })
  })

  it('retrouve le dialogue actif même si selectedFilename est fourni sans .json', async () => {
    const user = userEvent.setup()
    render(<DialogueCombobox selectedFilename="bravo" onSelect={vi.fn()} />)

    const trigger = await screen.findByTestId('dialogue-combobox-trigger')
    await waitFor(() => {
      expect(trigger).toHaveTextContent('Bravo Tale')
    })

    await user.click(trigger)
    const items = await screen.findAllByTestId('unity-dialogue-item')
    expect(items[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('ouvre le panneau avec Enter puis avec Espace sur le déclencheur fermé (AC #6)', async () => {
    const user = userEvent.setup()
    render(<DialogueCombobox selectedFilename={null} onSelect={vi.fn()} />)

    const trigger = await screen.findByTestId('dialogue-combobox-trigger')
    trigger.focus()
    await user.keyboard('{Enter}')
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })
    expect(screen.getByTestId('dialogue-combobox-panel')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
    })

    trigger.focus()
    await user.keyboard(' ')
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })
  })

  it("ouvre le panneau au clic et affiche recherche + tri + compteur", async () => {
    const user = userEvent.setup()
    render(<DialogueCombobox selectedFilename={null} onSelect={vi.fn()} />)

    const trigger = await screen.findByTestId('dialogue-combobox-trigger')
    await user.click(trigger)

    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })

    const panel = screen.getByTestId('dialogue-combobox-panel')
    expect(panel).toHaveAttribute('role', 'listbox')
    expect(screen.getByTestId('dialogue-combobox-search')).toBeInTheDocument()
    expect(screen.getByTitle('Trier les dialogues')).toBeInTheDocument()
    expect(screen.getByTestId('dialogue-combobox-count')).toHaveTextContent('2 dialogues')
  })

  it('filtre la liste via la recherche', async () => {
    const user = userEvent.setup()
    render(<DialogueCombobox selectedFilename={null} onSelect={vi.fn()} />)

    await user.click(await screen.findByTestId('dialogue-combobox-trigger'))
    const search = await screen.findByTestId('dialogue-combobox-search')

    await user.type(search, 'alpha')

    await waitFor(() => {
      expect(screen.getByTestId('dialogue-combobox-count')).toHaveTextContent('1 dialogue (sur 2 total)')
    })
    expect(screen.getAllByTestId('unity-dialogue-item')).toHaveLength(1)
  })

  it('change le tri (StyledSelect) et réordonne la liste (date-desc → Nom A-Z)', async () => {
    const user = userEvent.setup()
    render(<DialogueCombobox selectedFilename={null} onSelect={vi.fn()} />)

    await user.click(await screen.findByTestId('dialogue-combobox-trigger'))
    await waitFor(() => {
      expect(screen.getByTestId('dialogue-combobox-panel')).toBeInTheDocument()
    })

    const titlesDateDesc = screen.getAllByTestId('unity-dialogue-item-title')
    expect(titlesDateDesc[0]).toHaveTextContent(/bravo/i)
    expect(titlesDateDesc[1]).toHaveTextContent(/alpha/i)

    const sortSelect = screen.getByTitle('Trier les dialogues')
    await user.selectOptions(sortSelect, 'name-asc')

    await waitFor(() => {
      const titles = screen.getAllByTestId('unity-dialogue-item-title')
      expect(titles[0]).toHaveTextContent(/alpha/i)
      expect(titles[1]).toHaveTextContent(/bravo/i)
    })
  })

  it("appelle onSelect et ferme le panneau lors de la sélection d'un item", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<DialogueCombobox selectedFilename={null} onSelect={onSelect} />)

    const trigger = await screen.findByTestId('dialogue-combobox-trigger')
    await user.click(trigger)

    await waitFor(() => {
      expect(screen.getAllByTestId('unity-dialogue-item').length).toBeGreaterThan(0)
    })

    const items = screen.getAllByTestId('unity-dialogue-item')
    await user.click(items[0]!)

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect.mock.calls[0]?.[0]?.filename).toBe('bravo.json')
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
    })
  })

  it('Escape ferme le panneau et restaure le focus sur le déclencheur', async () => {
    const user = userEvent.setup()
    render(<DialogueCombobox selectedFilename={null} onSelect={vi.fn()} />)

    const trigger = await screen.findByTestId('dialogue-combobox-trigger')
    await user.click(trigger)

    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })

    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
      expect(trigger).toHaveFocus()
    })
  })

  it("le raccourci `/` global focuse l'input de recherche quand le panneau est ouvert", async () => {
    const user = userEvent.setup()
    render(<DialogueCombobox selectedFilename={null} onSelect={vi.fn()} />)

    const trigger = await screen.findByTestId('dialogue-combobox-trigger')
    await user.click(trigger)
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })

    trigger.focus()
    await user.keyboard('/')

    const search = screen.getByTestId('dialogue-combobox-search')
    await waitFor(() => {
      expect(search).toHaveFocus()
    })
  })

  it('ouvre le panneau et focuse la recherche avec `/` quand le panneau est fermé', async () => {
    const user = userEvent.setup()
    render(<DialogueCombobox selectedFilename={null} onSelect={vi.fn()} />)

    const trigger = await screen.findByTestId('dialogue-combobox-trigger')
    trigger.focus()
    await user.keyboard('/')

    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })
    await waitFor(() => {
      expect(screen.getByTestId('dialogue-combobox-search')).toHaveFocus()
    })
  })

  it('ferme le panneau sur clic extérieur', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <button type="button">hors combobox</button>
        <DialogueCombobox selectedFilename={null} onSelect={vi.fn()} />
      </div>
    )

    await user.click(await screen.findByTestId('dialogue-combobox-trigger'))
    await waitFor(() => {
      expect(screen.getByTestId('dialogue-combobox-panel')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'hors combobox' }))

    await waitFor(() => {
      expect(screen.queryByTestId('dialogue-combobox-panel')).not.toBeInTheDocument()
    })
  })

  it('navigation clavier : ArrowDown depuis la recherche puis Enter sélectionne', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<DialogueCombobox selectedFilename={null} onSelect={onSelect} />)

    await user.click(await screen.findByTestId('dialogue-combobox-trigger'))
    const search = await screen.findByTestId('dialogue-combobox-search')
    await waitFor(() => {
      expect(search).toHaveFocus()
    })

    await user.keyboard('{ArrowDown}')
    const items = await screen.findAllByTestId('unity-dialogue-item')
    expect(items[0]).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect.mock.calls[0]?.[0]?.filename).toBe('bravo.json')
  })

  it('options listbox : role=option et aria-selected sur la sélection', async () => {
    const user = userEvent.setup()
    render(<DialogueCombobox selectedFilename="bravo.json" onSelect={vi.fn()} />)

    await user.click(await screen.findByTestId('dialogue-combobox-trigger'))
    const items = await screen.findAllByTestId('unity-dialogue-item')
    expect(items[0]).toHaveAttribute('role', 'option')
    expect(items[0]).toHaveAttribute('aria-selected', 'true')
    expect(items[1]).toHaveAttribute('aria-selected', 'false')
  })

  it('Home / End déplacent le focus entre les options', async () => {
    const user = userEvent.setup()
    render(<DialogueCombobox selectedFilename={null} onSelect={vi.fn()} />)

    await user.click(await screen.findByTestId('dialogue-combobox-trigger'))
    const search = await screen.findByTestId('dialogue-combobox-search')
    await waitFor(() => {
      expect(search).toHaveFocus()
    })

    await user.keyboard('{ArrowDown}')
    const items = await screen.findAllByTestId('unity-dialogue-item')
    expect(items[0]).toHaveFocus()

    await user.keyboard('{End}')
    expect(items[items.length - 1]).toHaveFocus()

    await user.keyboard('{Home}')
    expect(items[0]).toHaveFocus()
  })

  it('expose refresh() via ref impératif et observe les nouveaux items', async () => {
    const ref = createRef<DialogueComboboxRef>()
    render(<DialogueCombobox ref={ref} selectedFilename={null} onSelect={vi.fn()} />)

    await waitFor(() => {
      expect(mockList).toHaveBeenCalledTimes(1)
    })

    mockList.mockResolvedValueOnce({
      dialogues: [
        ...FIXTURE,
        {
          filename: 'delta.json',
          file_path: '/data/delta.json',
          size_bytes: 256,
          modified_time: '2026-04-15T10:00:00.000Z',
          title: 'Delta Drama',
        },
      ],
      total: 3,
    })

    await act(async () => {
      await ref.current?.refresh()
    })

    expect(mockList).toHaveBeenCalledTimes(2)

    const user = userEvent.setup()
    await user.click(screen.getByTestId('dialogue-combobox-trigger'))
    await waitFor(() => {
      expect(screen.getByTestId('dialogue-combobox-count')).toHaveTextContent('3 dialogues')
    })
  })
})
