/**
 * Tests pour useLLMStore - Store Zustand pour sélection LLM
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLLMStore } from '../store/llmStore';
import * as configApi from '../api/config';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('useLLMStore', () => {
  beforeEach(() => {
    // Réinitialiser le store et localStorage avant chaque test
    localStorage.clear();
    const { result } = renderHook(() => useLLMStore());
    act(() => {
      result.current.setProvider('openai');
      result.current.setModel('gpt-5.6-terra');
      result.current.setAvailableModels([]);
    });
  });

  it('should have initial state', () => {
    const { result } = renderHook(() => useLLMStore());

    expect(result.current.provider).toBe('openai');
    expect(result.current.model).toBe('gpt-5.6-terra');
    expect(result.current.availableModels).toEqual([]);
  });

  it('should set provider', () => {
    const { result } = renderHook(() => useLLMStore());

    act(() => {
      result.current.setProvider('mistral');
    });

    expect(result.current.provider).toBe('mistral');
  });

  it('should set model', () => {
    const { result } = renderHook(() => useLLMStore());

    act(() => {
      result.current.setModel('labs-mistral-small-creative');
    });

    expect(result.current.model).toBe('labs-mistral-small-creative');
  });

  it('should set available models', () => {
    const { result } = renderHook(() => useLLMStore());

    const models = [
      {
        api_identifier: 'gpt-5.6-terra',
        display_name: 'GPT-5.6 Terra',
        client_type: 'openai' as const,
        parameters: { default_temperature: 0.7, max_tokens: 4096 },
      },
      {
        api_identifier: 'labs-mistral-small-creative',
        display_name: 'Mistral Small Creative',
        client_type: 'mistral' as const,
        parameters: { default_temperature: 0.7, max_tokens: 32000 },
      },
    ];

    act(() => {
      result.current.setAvailableModels(models);
    });

    expect(result.current.availableModels).toEqual(models);
  });

  it('should persist provider to localStorage', () => {
    const { result } = renderHook(() => useLLMStore());

    act(() => {
      result.current.setProvider('mistral');
    });

    expect(localStorage.getItem('llm-provider')).toBe('mistral');
  });

  it('should persist model to localStorage', () => {
    const { result } = renderHook(() => useLLMStore());

    act(() => {
      result.current.setModel('labs-mistral-small-creative');
    });

    expect(localStorage.getItem('llm-model')).toBe('labs-mistral-small-creative');
  });

  it('should persist and retrieve provider from localStorage', () => {
    const { result } = renderHook(() => useLLMStore());

    // Définir un provider
    act(() => {
      result.current.setProvider('mistral');
    });

    // Vérifier que le localStorage a été mis à jour
    expect(localStorage.getItem('llm-provider')).toBe('mistral');
    // Vérifier que l'état a été mis à jour
    expect(result.current.provider).toBe('mistral');
  });

  it('should persist and retrieve model from localStorage', () => {
    const { result } = renderHook(() => useLLMStore());

    // Définir un modèle
    act(() => {
      result.current.setModel('labs-mistral-small-creative');
    });

    // Vérifier que le localStorage a été mis à jour
    expect(localStorage.getItem('llm-model')).toBe('labs-mistral-small-creative');
    // Vérifier que l'état a été mis à jour
    expect(result.current.model).toBe('labs-mistral-small-creative');
  });

  it('should load models from API', async () => {
    // L'endpoint /api/v1/config/llm/models retourne {models: [...], total: ...}
    const mockApiResponse = {
      models: [
        {
          model_identifier: 'gpt-5.6-terra',
          display_name: 'GPT-5.6 Terra',
          client_type: 'openai',
          max_tokens: 4096,
        },
        {
          model_identifier: 'labs-mistral-small-creative',
          display_name: 'Mistral Small Creative',
          client_type: 'mistral',
          max_tokens: 32000,
        },
      ],
      total: 2,
    };

    const expectedModels = [
      {
        api_identifier: 'gpt-5.6-terra',
        display_name: 'GPT-5.6 Terra',
        client_type: 'openai' as const,
        parameters: { default_temperature: 0.7, max_tokens: 4096 },
      },
      {
        api_identifier: 'labs-mistral-small-creative',
        display_name: 'Mistral Small Creative',
        client_type: 'mistral' as const,
        parameters: { default_temperature: 0.7, max_tokens: 32000 },
      },
    ];

    vi.spyOn(configApi, 'listLLMModels').mockResolvedValue(mockApiResponse);

    const { result } = renderHook(() => useLLMStore());

    await act(async () => {
      await result.current.loadModels();
    });

    expect(result.current.availableModels).toEqual(expectedModels);
    expect(configApi.listLLMModels).toHaveBeenCalled();
  });

  it('should handle API error when loading models', async () => {
    vi.spyOn(configApi, 'listLLMModels').mockRejectedValue(new Error('HTTP 500'));

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useLLMStore());

    await act(async () => {
      await result.current.loadModels();
    });

    // Les modèles ne doivent pas changer en cas d'erreur
    expect(result.current.availableModels).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('should update immutably', () => {
    const { result } = renderHook(() => useLLMStore());

    const initialState = result.current;

    act(() => {
      result.current.setProvider('mistral');
    });

    // Le state doit être un nouvel objet (immutable)
    expect(result.current).not.toBe(initialState);
  });
});
