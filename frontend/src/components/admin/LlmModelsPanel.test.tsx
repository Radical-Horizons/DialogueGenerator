import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { LlmModelsPanel } from './LlmModelsPanel'

vi.mock('../../api/config', () => ({
  listLLMModels: vi.fn().mockResolvedValue({
    models: [
      {
        model_identifier: 'aion-labs/aion-2.0',
        display_name: 'Aion 2.0 (OpenRouter)',
        client_type: 'openrouter',
        max_tokens: 32000,
      },
    ],
    total: 1,
  }),
}))

vi.mock('../../api/llmModelsAdmin', () => ({
  createLLMModel: vi.fn(),
  updateLLMModel: vi.fn(),
  deleteLLMModel: vi.fn(),
}))

describe('LlmModelsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('affiche le formulaire d’ajout et la liste', async () => {
    render(
      <MemoryRouter>
        <LlmModelsPanel />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Modèles LLM' })).toBeInTheDocument()
    expect(screen.getByText('Ajouter un modèle OpenRouter')).toBeInTheDocument()
    expect(await screen.findByText('Aion 2.0 (OpenRouter)')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('aion-labs/aion-2.0')).toBeInTheDocument()
  })
})
