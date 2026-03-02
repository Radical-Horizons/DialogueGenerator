import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  GenerationProgressModal,
  type GenerationProgressModalProps,
} from './GenerationProgressModal'

function createDefaultProps(overrides: Partial<GenerationProgressModalProps> = {}): GenerationProgressModalProps {
  return {
    isOpen: true,
    content: '',
    currentStep: 'Generating',
    error: null,
    isInterrupting: false,
    onInterrupt: vi.fn(),
    onMinimize: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
}

describe('GenerationProgressModal', () => {
  it('neutralizes dangerous inline HTML while preserving markdown rendering', () => {
    const streamedContent = JSON.stringify({
      title: 'Titre',
      node: {
        speaker: 'NPC',
        line: 'Bonjour <img src=x onerror="alert(1)"> <script>alert("xss")</script>\\n**sécurisé** _italique_',
        choices: [],
      },
    })

    render(<GenerationProgressModal {...createDefaultProps({ content: streamedContent })} />)

    const lineElement = screen.getByTestId('streaming-line')

    expect(lineElement.innerHTML).not.toContain('<img')
    expect(lineElement.innerHTML).not.toContain('<script>')
    expect(lineElement.innerHTML).toContain('&lt;img src=x onerror="alert(1)"&gt;')
    expect(lineElement.innerHTML).toContain('&lt;script&gt;alert("xss")&lt;/script&gt;')
    expect(lineElement.innerHTML).toContain('<strong>sécurisé</strong>')
    expect(lineElement.innerHTML).toContain('<em>italique</em>')
    expect(lineElement.innerHTML).toContain('<br')
  })
})
