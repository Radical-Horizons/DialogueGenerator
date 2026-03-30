/**
 * Tests pour UnityDialogueViewer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UnityDialogueViewer } from './UnityDialogueViewer'
import type { GenerateUnityDialogueResponse } from '../../types/api'
import * as dialoguesAPI from '../../api/dialogues'

// Mock de l'API
vi.mock('../../api/dialogues')
const mockDialoguesAPI = vi.mocked(dialoguesAPI)

// Mock du toast
vi.mock('../shared', async () => {
  const actual = await vi.importActual('../shared')
  return {
    ...actual,
    useToast: () => vi.fn(),
  }
})

describe('UnityDialogueViewer', () => {
  const mockOnExport = vi.fn()

  const mockUnityResponse: GenerateUnityDialogueResponse = {
    raw_prompt: '',
    prompt_hash: 'test-hash',
    json_content: JSON.stringify([
      {
        id: 'START',
        speaker: 'Test NPC',
        line: 'Hello, player!',
        choices: [
          {
            text: 'Hello!',
            targetNode: 'NODE_1',
          },
          {
            text: 'Goodbye!',
            targetNode: 'END',
          },
        ],
      },
    ]),
    title: 'Test Dialogue',
    estimated_tokens: 100,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockDialoguesAPI.exportUnityDialogue.mockResolvedValue({
      filename: 'test_dialogue.json',
      file_path: '/test/path/test_dialogue.json',
      success: true,
    })
  })

  it('affiche le titre du dialogue', () => {
    render(<UnityDialogueViewer response={mockUnityResponse} />)

    expect(screen.getByText('Test Dialogue')).toBeInTheDocument()
  })

  it('parse et affiche les nœuds du dialogue', () => {
    render(<UnityDialogueViewer response={mockUnityResponse} />)

    expect(screen.getByText('START')).toBeInTheDocument()
    expect(screen.getByText('Test NPC')).toBeInTheDocument()
    expect(screen.getByText('Hello, player!')).toBeInTheDocument()
    expect(screen.getByText('Hello!')).toBeInTheDocument()
    expect(screen.getByText('Goodbye!')).toBeInTheDocument()
  })

  it('affiche les boutons d\'action', () => {
    render(<UnityDialogueViewer response={mockUnityResponse} />)

    expect(screen.getByText('Copier JSON')).toBeInTheDocument()
    expect(screen.getByText('Exporter vers Unity')).toBeInTheDocument()
  })

  it('affiche un message si le JSON est invalide', () => {
    const invalidResponse: GenerateUnityDialogueResponse = {
      raw_prompt: '',
      prompt_hash: 'h1',
      json_content: 'invalid json',
      title: 'Invalid',
      estimated_tokens: 0,
    }

    render(<UnityDialogueViewer response={invalidResponse} />)

    expect(screen.getByText(/aucun dialogue à afficher/i)).toBeInTheDocument()
  })

  it('affiche un message si le JSON n\'est pas un tableau', () => {
    const invalidResponse: GenerateUnityDialogueResponse = {
      raw_prompt: '',
      prompt_hash: 'h2',
      json_content: JSON.stringify({ not: 'an array' }),
      title: 'Invalid',
      estimated_tokens: 0,
    }

    render(<UnityDialogueViewer response={invalidResponse} />)

    expect(screen.getByText(/aucun dialogue à afficher/i)).toBeInTheDocument()
  })

  it('permet d\'exporter le dialogue Unity', async () => {
    const user = userEvent.setup()
    render(<UnityDialogueViewer response={mockUnityResponse} onExport={mockOnExport} />)

    const exportButton = screen.getByText('Exporter vers Unity')
    await user.click(exportButton)

    await waitFor(() => {
      expect(mockDialoguesAPI.exportUnityDialogue).toHaveBeenCalledWith({
        json_content: mockUnityResponse.json_content,
        title: 'Test Dialogue',
      })
    })
  })

  it('appelle onExport après un export réussi', async () => {
    const user = userEvent.setup()
    render(<UnityDialogueViewer response={mockUnityResponse} onExport={mockOnExport} />)

    const exportButton = screen.getByText('Exporter vers Unity')
    await user.click(exportButton)

    await waitFor(() => {
      expect(mockOnExport).toHaveBeenCalledWith('test_dialogue.json')
    })
  })

  it('permet de copier le JSON dans le presse-papier', async () => {
    const user = userEvent.setup()
    // Mock de navigator.clipboard
    const mockWriteText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: mockWriteText },
      writable: true,
      configurable: true,
    })

    render(<UnityDialogueViewer response={mockUnityResponse} />)

    const copyButton = screen.getByText('Copier JSON')
    await user.click(copyButton)

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith(mockUnityResponse.json_content)
    })
  })

  it('affiche les informations de tokens et warnings si présents', () => {
    const responseWithWarning: GenerateUnityDialogueResponse = {
      ...mockUnityResponse,
      warning: 'Test warning',
    }

    render(<UnityDialogueViewer response={responseWithWarning} />)

    expect(screen.getByText(/test warning/i)).toBeInTheDocument()
    expect(screen.getByText(/tokens estimés: 100/i)).toBeInTheDocument()
  })

  it('affiche les options avancées quand elles sont présentes', async () => {
    const responseWithAdvanced: GenerateUnityDialogueResponse = {
      raw_prompt: '',
      prompt_hash: 'h-adv',
      json_content: JSON.stringify([
        {
          id: 'START',
          speaker: 'Test NPC',
          line: 'Hello!',
          test: 'strength > 10',
          successNode: 'SUCCESS',
          failureNode: 'FAILURE',
        },
      ]),
      title: 'Test',
      estimated_tokens: 100,
    }

    const user = userEvent.setup()
    render(<UnityDialogueViewer response={responseWithAdvanced} />)

    // Chercher le bouton "Options"
    const optionsButton = screen.getByText(/▶ options/i)
    await user.click(optionsButton)

    await waitFor(() => {
      expect(screen.getByText(/test d'attribut/i)).toBeInTheDocument()
      expect(screen.getByText(/strength > 10/i)).toBeInTheDocument()
      expect(screen.getByText(/nœud succès/i)).toBeInTheDocument()
      expect(screen.getByText(/SUCCESS/i)).toBeInTheDocument()
      expect(screen.getByText(/nœud échec/i)).toBeInTheDocument()
      expect(screen.getByText(/FAILURE/i)).toBeInTheDocument()
    })
  })

  it('affiche "Fin du dialogue" pour un nœud sans choix ni nextNode', () => {
    const responseEndNode: GenerateUnityDialogueResponse = {
      raw_prompt: '',
      prompt_hash: 'h4',
      json_content: JSON.stringify([
        {
          id: 'END',
          speaker: 'Test NPC',
          line: 'Goodbye!',
        },
      ]),
      title: 'Test',
      estimated_tokens: 100,
    }

    render(<UnityDialogueViewer response={responseEndNode} />)

    expect(screen.getByText(/fin du dialogue/i)).toBeInTheDocument()
  })

  it('affiche le nextNode pour un dialogue linéaire', () => {
    const responseLinear: GenerateUnityDialogueResponse = {
      raw_prompt: '',
      prompt_hash: 'h5',
      json_content: JSON.stringify([
        {
          id: 'START',
          speaker: 'Test NPC',
          line: 'Hello!',
          nextNode: 'NEXT',
        },
      ]),
      title: 'Test',
      estimated_tokens: 100,
    }

    render(<UnityDialogueViewer response={responseLinear} />)

    expect(screen.getByText(/→ suivant: NEXT/i)).toBeInTheDocument()
  })
})

