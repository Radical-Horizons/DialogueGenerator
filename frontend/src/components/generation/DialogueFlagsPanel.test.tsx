/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DialogueFlagsPanel } from './DialogueFlagsPanel'
import * as flagsAPI from '../../api/flags'
import { useGraphStore } from '../../store/graphStore'

vi.mock('../../api/flags', () => ({
  listFlags: vi.fn(),
}))

describe('DialogueFlagsPanel', () => {
  beforeEach(() => {
    vi.mocked(flagsAPI.listFlags).mockResolvedValue({
      total: 2,
      flags: [
        {
          id: 'X_BOOL',
          type: 'bool',
          category: 'Event',
          label: 'Bool label',
          defaultValue: 'false',
          tags: [],
          isFavorite: false,
          semanticType: 'bool',
          scope: 'conversationnel',
        },
        {
          id: 'Y_CNT',
          type: 'int',
          category: 'Stat',
          label: 'Counter label',
          defaultValue: '5',
          tags: [],
          isFavorite: false,
          semanticType: 'compteur',
          scope: 'mécanique',
          minValue: 0,
          maxValue: 10,
        },
      ],
    })
    useGraphStore.setState({
      dialogueFlagBindings: [],
    })
  })

  it('charge le catalogue et permet d’ajouter un flag bool', async () => {
    const user = userEvent.setup()
    render(<DialogueFlagsPanel />)

    await waitFor(() => {
      expect(flagsAPI.listFlags).toHaveBeenCalled()
    })

    expect(await screen.findByText('Bool label')).toBeInTheDocument()

    const addButtons = screen.getAllByRole('button', { name: /^Ajouter$/i })
    await user.click(addButtons[0])

    expect(useGraphStore.getState().dialogueFlagBindings).toHaveLength(1)
    expect(useGraphStore.getState().dialogueFlagBindings[0].flagId).toBe('X_BOOL')
  })

  it('affiche une alerte seuil lorsque trop de flags conversationnels', async () => {
    vi.mocked(flagsAPI.listFlags).mockResolvedValue({
      total: 11,
      flags: Array.from({ length: 11 }, (_, i) => ({
        id: `C${i}`,
        type: 'bool',
        category: 'Event',
        label: `L${i}`,
        defaultValue: 'false',
        tags: [],
        isFavorite: false,
        semanticType: 'bool',
        scope: 'conversationnel',
      })),
    })
    useGraphStore.setState({
      dialogueFlagBindings: Array.from({ length: 11 }, (_, i) => ({
        flagId: `C${i}`,
        type: 'bool' as const,
        initialValue: false,
      })),
    })
    render(<DialogueFlagsPanel />)

    await waitFor(() => {
      expect(flagsAPI.listFlags).toHaveBeenCalled()
    })

    expect(await screen.findByText(/Liaisons « conversationnelles »/)).toBeInTheDocument()
  })
})
