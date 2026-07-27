import { FormEvent, useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'

import { listLLMModels } from '../../api/config'
import {
  createLLMModel,
  deleteLLMModel,
  updateLLMModel,
} from '../../api/llmModelsAdmin'
import type { LLMModelResponse } from '../../types/api'
import { theme } from '../../theme'

const fieldStyle: React.CSSProperties = {
  minHeight: 44,
  boxSizing: 'border-box',
  padding: '0.55rem 0.7rem',
  color: theme.input.color,
  background: theme.input.background,
  border: `1px solid ${theme.input.border}`,
  borderRadius: 4,
  width: '100%',
}

function apiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 403) {
      return 'Accès admin requis.'
    }
    const message = error.response?.data?.error?.message
    if (typeof message === 'string') {
      return message
    }
  }
  return 'Une erreur est survenue. Réessayez.'
}

export function LlmModelsPanel() {
  const navigate = useNavigate()
  const [models, setModels] = useState<LLMModelResponse[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [apiIdentifier, setApiIdentifier] = useState('aion-labs/aion-2.0')
  const [displayName, setDisplayName] = useState('Aion 2.0 (OpenRouter)')
  const [maxTokens, setMaxTokens] = useState(32000)
  const [inputPrice, setInputPrice] = useState(0.8)
  const [outputPrice, setOutputPrice] = useState(1.6)

  const [editId, setEditId] = useState<string | null>(null)
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editInputPrice, setEditInputPrice] = useState(0)
  const [editOutputPrice, setEditOutputPrice] = useState(0)

  const load = useCallback(async () => {
    try {
      const data = await listLLMModels()
      setModels(data.models || [])
      setError(null)
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        navigate('/')
        return
      }
      setError(apiErrorMessage(err))
    }
  }, [navigate])

  useEffect(() => {
    void load()
  }, [load])

  const onCreate = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await createLLMModel({
        api_identifier: apiIdentifier.trim(),
        display_name: displayName.trim(),
        client_type: 'openrouter',
        max_tokens: maxTokens,
        input_price_per_1M: inputPrice,
        output_price_per_1M: outputPrice,
      })
      await load()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const startEdit = (model: LLMModelResponse) => {
    setEditId(model.model_identifier)
    setEditDisplayName(model.display_name)
    setEditInputPrice(0)
    setEditOutputPrice(0)
  }

  const onSaveEdit = async () => {
    if (!editId) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const payload: {
        display_name: string
        input_price_per_1M?: number
        output_price_per_1M?: number
      } = { display_name: editDisplayName.trim() }
      if (editInputPrice > 0 && editOutputPrice > 0) {
        payload.input_price_per_1M = editInputPrice
        payload.output_price_per_1M = editOutputPrice
      }
      await updateLLMModel(editId, payload)
      setEditId(null)
      await load()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const onDelete = async (id: string) => {
    if (!window.confirm(`Supprimer le modèle « ${id} » ?`)) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await deleteLLMModel(id)
      await load()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <h2 style={{ color: theme.text.primary, margin: '0 0 0.5rem', fontSize: '1.15rem' }}>
        Modèles LLM
      </h2>
      <p style={{ color: theme.text.secondary, marginBottom: '1.5rem' }}>
        Ajoutez ou modifiez des modèles OpenRouter (ex. Aion 2.0) pour la génération de dialogues.
      </p>

      {error && (
        <div
          role="alert"
          style={{
            marginBottom: '1rem',
            padding: '0.75rem 1rem',
            borderRadius: 4,
            background: theme.state.error.background,
            color: theme.text.primary,
            border: `1px solid ${theme.state.error.border}`,
          }}
        >
          {error}
        </div>
      )}

      <form
        onSubmit={onCreate}
        style={{
          display: 'grid',
          gap: '0.75rem',
          marginBottom: '2rem',
          padding: '1rem',
          border: `1px solid ${theme.border.primary}`,
          borderRadius: 6,
        }}
      >
        <h2 style={{ color: theme.text.primary, margin: 0, fontSize: '1.1rem' }}>
          Ajouter un modèle OpenRouter
        </h2>
        <label style={{ color: theme.text.secondary }}>
          Identifiant API
          <input
            style={fieldStyle}
            value={apiIdentifier}
            onChange={(e) => setApiIdentifier(e.target.value)}
            required
            placeholder="aion-labs/aion-2.0"
          />
        </label>
        <label style={{ color: theme.text.secondary }}>
          Nom d&apos;affichage
          <input
            style={fieldStyle}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
        </label>
        <label style={{ color: theme.text.secondary }}>
          Max tokens
          <input
            style={fieldStyle}
            type="number"
            min={256}
            value={maxTokens}
            onChange={(e) => setMaxTokens(Number(e.target.value))}
          />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <label style={{ color: theme.text.secondary }}>
            Prix input $/1M
            <input
              style={fieldStyle}
              type="number"
              min={0}
              step={0.01}
              value={inputPrice}
              onChange={(e) => setInputPrice(Number(e.target.value))}
            />
          </label>
          <label style={{ color: theme.text.secondary }}>
            Prix output $/1M
            <input
              style={fieldStyle}
              type="number"
              min={0}
              step={0.01}
              value={outputPrice}
              onChange={(e) => setOutputPrice(Number(e.target.value))}
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={busy}
          style={{
            minHeight: 44,
            padding: '0.5rem 1rem',
            cursor: busy ? 'wait' : 'pointer',
            backgroundColor: theme.button.primary.background,
            color: theme.button.primary.color,
            border: `1px solid ${theme.border.primary}`,
            borderRadius: 4,
          }}
        >
          Ajouter
        </button>
      </form>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.75rem' }}>
        {models.map((model) => (
          <li
            key={model.model_identifier}
            style={{
              padding: '0.85rem 1rem',
              border: `1px solid ${theme.border.primary}`,
              borderRadius: 6,
              background: theme.background.secondary,
            }}
          >
            {editId === model.model_identifier ? (
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                <input
                  style={fieldStyle}
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <input
                    style={fieldStyle}
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="Prix input $/1M (optionnel)"
                    value={editInputPrice || ''}
                    onChange={(e) => setEditInputPrice(Number(e.target.value))}
                  />
                  <input
                    style={fieldStyle}
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="Prix output $/1M (optionnel)"
                    value={editOutputPrice || ''}
                    onChange={(e) => setEditOutputPrice(Number(e.target.value))}
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" disabled={busy} onClick={() => void onSaveEdit()}>
                    Enregistrer
                  </button>
                  <button type="button" disabled={busy} onClick={() => setEditId(null)}>
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ color: theme.text.primary, fontWeight: 600 }}>
                    {model.display_name}
                  </div>
                  <div style={{ color: theme.text.secondary, fontSize: '0.85rem' }}>
                    {model.model_identifier} · {model.client_type} · {model.max_tokens} tokens
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" disabled={busy} onClick={() => startEdit(model)}>
                    Modifier
                  </button>
                  {model.client_type === 'openrouter' && (
                    <button type="button" disabled={busy} onClick={() => void onDelete(model.model_identifier)}>
                      Supprimer
                    </button>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
