/**
 * Viewer « Schéma Unity de référence » (Story 5.3 / FR51).
 */
import { useEffect, useState } from 'react'
import { theme } from '../../theme'
import { GraphToolFloatingShell } from './GraphToolFloatingShell'
import { getUnitySchemaReference } from '../../api/unityDialogues'
import type { UnitySchemaReferenceResponse } from '../../types/graph'

interface UnitySchemaReferencePanelProps {
  isOpen: boolean
  onClose: () => void
}

export function UnitySchemaReferencePanel({ isOpen, onClose }: UnitySchemaReferencePanelProps) {
  const [loading, setLoading] = useState(false)
  const [schema, setSchema] = useState<UnitySchemaReferenceResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setLoading(true)
    setError(null)
    getUnitySchemaReference()
      .then((data) => {
        if (!cancelled) setSchema(data)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Impossible de charger le schéma')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <GraphToolFloatingShell
      title={<strong>Schéma Unity de référence</strong>}
      onClose={onClose}
      dataTestId="unity-schema-reference-panel"
      storageKey="schema-reference"
      initialOffset={{ top: 80, left: 360 }}
      width="min(440px, calc(100vw - 24px))"
      maxHeight="min(75vh, 560px)"
      closeButtonTestId="schema-reference-close-btn"
      closeAriaLabel="Fermer"
      closeButtonChildren="✕"
      closeButtonStyle={{
        background: 'transparent',
        border: 'none',
        color: theme.text.secondary,
        fontSize: '1rem',
        padding: '0 4px',
      }}
    >
      {loading && (
        <p data-testid="schema-reference-loading" style={{ color: theme.text.secondary }}>
          Chargement…
        </p>
      )}
      {error && (
        <p data-testid="schema-reference-error" style={{ color: theme.text.secondary }}>
          {error}
        </p>
      )}
      {!loading && schema && (
        <div data-testid="schema-reference-content">
          {!schema.available && (
            <p style={{ color: theme.text.secondary, fontSize: '0.82rem' }}>
              Schéma indisponible en production — source : {schema.source_path}
            </p>
          )}
          {schema.version && (
            <p style={{ margin: '0 0 8px', fontSize: '0.82rem' }}>
              Version : <strong>{schema.version}</strong>
            </p>
          )}
          <p style={{ margin: '0 0 8px', fontSize: '0.82rem', color: theme.text.secondary }}>
            Champs racine requis : {schema.required_root_fields.join(', ')}
          </p>
          <p style={{ margin: '0 0 8px', fontSize: '0.78rem', color: theme.text.secondary }}>
            Source : {schema.source_path}
          </p>
          <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', paddingBottom: 4 }}>Section</th>
                <th style={{ textAlign: 'left', paddingBottom: 4 }}>Requis</th>
              </tr>
            </thead>
            <tbody>
              {schema.sections.map((section) => (
                <tr key={section.name}>
                  <td style={{ verticalAlign: 'top', padding: '4px 8px 4px 0' }}>
                    <strong>{section.name}</strong>
                    <div style={{ color: theme.text.secondary }}>{section.description}</div>
                  </td>
                  <td style={{ verticalAlign: 'top', padding: '4px 0' }}>
                    {section.required_fields.join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GraphToolFloatingShell>
  )
}
