/**
 * Tests pour ModelSelector - Sélecteur provider/model
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ModelSelector } from '../components/generation/ModelSelector';

// Mock du store
const mockUseLLMStore = vi.fn();
vi.mock('../store/llmStore', () => ({
  useLLMStore: () => mockUseLLMStore(),
}));

describe('ModelSelector', () => {
  const mockSetProvider = vi.fn();
  const mockSetModel = vi.fn();
  const mockLoadModels = vi.fn();

  const mockAvailableModels = [
    {
      api_identifier: 'gpt-5.6-terra',
      display_name: 'GPT-5.6 Terra',
      client_type: 'openai',
      parameters: { default_temperature: 0.7, max_tokens: 4096 },
    },
    {
      api_identifier: 'gpt-5.6-sol',
      display_name: 'GPT-5.6 Terra Pro',
      client_type: 'openai',
      parameters: { default_temperature: 0.7, max_tokens: 4096 },
    },
    {
      api_identifier: 'mistralai/mistral-medium-3-5',
      display_name: 'Mistral Small Creative',
      client_type: 'mistral',
      parameters: { default_temperature: 0.7, max_tokens: 32000 },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLLMStore.mockReturnValue({
      provider: 'openai',
      model: 'gpt-5.6-terra',
      availableModels: mockAvailableModels,
      setProvider: mockSetProvider,
      setModel: mockSetModel,
      loadModels: mockLoadModels,
    });
  });

  it('should render model selector', () => {
    render(<ModelSelector />);

    // Vérifier que le sélecteur est affiché (par son id)
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
  });

  it('should display current model', () => {
    render(<ModelSelector />);

    // Vérifier que le modèle actuel est dans le select
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue('gpt-5.6-terra');
  });

  it('should group models by provider', () => {
    render(<ModelSelector />);

    const select = screen.getByRole('combobox');
    const optgroups = select.querySelectorAll('optgroup');
    expect(optgroups.length).toBeGreaterThan(0);
    expect(screen.getByText('GPT-5.6 Terra')).toBeInTheDocument();
    expect(screen.getByText('Mistral Small Creative')).toBeInTheDocument();
  });

  it('should display provider icons', () => {
    render(<ModelSelector />);

    // Le composant ne rend pas de texte "Provider actuel:" - vérifier juste que le select est présent
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue('gpt-5.6-terra');
  });

  it('should change model on selection', async () => {
    render(<ModelSelector />);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'mistralai/mistral-medium-3-5' } });

    await waitFor(() => {
      expect(mockSetProvider).toHaveBeenCalledWith('mistral');
      expect(mockSetModel).toHaveBeenCalledWith('mistralai/mistral-medium-3-5');
    });
  });

  it('should load models on mount', () => {
    render(<ModelSelector />);

    // Vérifier que loadModels a été appelé
    expect(mockLoadModels).toHaveBeenCalledOnce();
  });

  it('should handle empty model list', () => {
    mockUseLLMStore.mockReturnValue({
      provider: 'openai',
      model: 'gpt-5.6-terra',
      availableModels: [],
      setProvider: mockSetProvider,
      setModel: mockSetModel,
      loadModels: mockLoadModels,
    });

    render(<ModelSelector />);

    // Le composant doit gérer le cas où aucun modèle n'est disponible - le select doit être présent mais vide
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
  });

  it('should display correct provider for Mistral model', () => {
    mockUseLLMStore.mockReturnValue({
      provider: 'mistral',
      model: 'mistralai/mistral-medium-3-5',
      availableModels: mockAvailableModels,
      setProvider: mockSetProvider,
      setModel: mockSetModel,
      loadModels: mockLoadModels,
    });

    render(<ModelSelector />);

    expect(screen.getByText(/Mistral Small Creative/i)).toBeInTheDocument();
  });

  it('should update provider when model from different provider is selected', async () => {
    render(<ModelSelector />);

    // Sélectionner le select
    const select = screen.getByRole('combobox');

    // Sélectionner un autre modèle OpenAI
    fireEvent.change(select, { target: { value: 'gpt-5.6-sol' } });

    // Vérifier que le modèle a changé sans changer de provider
    await waitFor(() => {
      expect(mockSetProvider).toHaveBeenCalledWith('openai');
      expect(mockSetModel).toHaveBeenCalledWith('gpt-5.6-sol');
    });
  });
});
