/**
 * Store Zustand pour la sélection du provider et modèle LLM
 */
import { create } from 'zustand'
import { listLLMModels } from '../api/config'
import { normalizeModelId } from '../constants'

interface LLMModel {
  api_identifier: string;
  display_name: string;
  client_type: 'openai' | 'mistral' | 'openrouter';
  parameters: {
    default_temperature: number;
    max_tokens: number;
  };
}

interface LLMStore {
  provider: 'openai' | 'mistral' | 'openrouter';
  model: string;
  availableModels: LLMModel[];
  setProvider: (provider: 'openai' | 'mistral' | 'openrouter') => void;
  setModel: (model: string) => void;
  setAvailableModels: (models: LLMModel[]) => void;
  loadModels: () => Promise<void>;
}

const rawStoredModel = localStorage.getItem('llm-model') || 'gpt-5.6-terra'
const initialModel = normalizeModelId(rawStoredModel)
if (initialModel !== rawStoredModel) {
  localStorage.setItem('llm-model', initialModel)
}

export const useLLMStore = create<LLMStore>((set) => ({
  // État initial
  provider: (localStorage.getItem('llm-provider') as 'openai' | 'mistral' | 'openrouter') || 'openai',
  model: initialModel,
  availableModels: [],

  // Actions
  setProvider: (provider) => {
    localStorage.setItem('llm-provider', provider);
    set({ provider });
  },

  setModel: (model) => {
    const normalized = normalizeModelId(model)
    localStorage.setItem('llm-model', normalized)
    set({ model: normalized })
  },

  setAvailableModels: (models) => {
    set({ availableModels: models });
  },

  loadModels: async () => {
    try {
      const data = await listLLMModels()
      const apiModels = data.models || []
      const models = apiModels.map((m) => ({
        api_identifier: m.model_identifier,
        display_name: m.display_name,
        client_type: m.client_type as 'openai' | 'mistral' | 'openrouter',
        parameters: {
          default_temperature: 0.7,
          max_tokens: m.max_tokens || 4096,
        },
      }))
      set({ availableModels: models })
    } catch (error) {
      console.error('Erreur lors du chargement des modèles LLM:', error)
    }
  },
}));
