/**
 * Composant ModelSelector - Sélecteur provider/model LLM
 */
import React, { useEffect } from 'react';
import { useLLMStore } from '../../store/llmStore';
import { theme } from '../../theme';
import { StyledSelect } from '../shared/StyledSelect';

export interface ModelSelectorProps {
  style?: React.CSSProperties;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ style }) => {
  const {
    model,
    availableModels,
    setProvider,
    setModel,
    loadModels,
  } = useLLMStore();

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  // Grouper les modèles par provider
  const modelsByProvider = availableModels.reduce((acc, m) => {
    if (!acc[m.client_type]) {
      acc[m.client_type] = [];
    }
    acc[m.client_type].push(m);
    return acc;
  }, {} as Record<string, typeof availableModels>);

  const handleModelChange = (selectedModel: typeof availableModels[0]) => {
    setProvider(selectedModel.client_type);
    setModel(selectedModel.api_identifier);
  };

  return (
    <StyledSelect
      id="model-select"
      value={model}
      onChange={(e) => {
        const selectedModel = availableModels.find((m) => m.api_identifier === e.target.value);
        if (selectedModel) {
          handleModelChange(selectedModel);
        }
      }}
      style={{
        width: '100%',
        padding: '0.5rem',
        boxSizing: 'border-box',
        backgroundColor: theme.input.background,
        border: `1px solid ${theme.input.border}`,
        color: theme.input.color,
        borderRadius: '4px',
        fontSize: '0.9rem',
        ...style,
      }}
    >
      {Object.entries(modelsByProvider).map(([providerType, models]) => (
        <optgroup key={providerType} label={providerType === 'openai' ? 'OpenAI' : 'Mistral'}>
          {models.map((m) => (
            <option key={m.api_identifier} value={m.api_identifier}>
              {m.display_name}
            </option>
          ))}
        </optgroup>
      ))}
    </StyledSelect>
  );
};
