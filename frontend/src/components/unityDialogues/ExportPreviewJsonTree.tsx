/**
 * Arbre JSON expandable pour preview export Unity (Story 5.5 / FR53).
 */
import { memo, useCallback, useMemo, useState } from 'react'
import { theme } from '../../theme'

const blockStyle: React.CSSProperties = {
  margin: 0,
  padding: '0.5rem 0.75rem',
  backgroundColor: theme.background.secondary,
  border: `1px solid ${theme.border.primary}`,
  borderRadius: '4px',
  fontSize: '0.75rem',
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  overflow: 'auto',
  maxHeight: '40vh',
  color: theme.text.primary,
  fontFamily: 'ui-monospace, monospace',
}

const toggleStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: theme.text.primary,
  cursor: 'pointer',
  padding: '0.25rem 0',
  textAlign: 'left',
  fontSize: '0.8rem',
  width: '100%',
}

interface UnityPreviewNode {
  id?: string
  [key: string]: unknown
}

function parseUnityDocument(jsonContent: string): { schemaVersion?: string; nodes: UnityPreviewNode[] } {
  try {
    const parsed = JSON.parse(jsonContent) as Record<string, unknown>
    if (Array.isArray(parsed)) {
      return { nodes: parsed as UnityPreviewNode[] }
    }
    const nodes = parsed.nodes
    return {
      schemaVersion: typeof parsed.schemaVersion === 'string' ? parsed.schemaVersion : undefined,
      nodes: Array.isArray(nodes) ? (nodes as UnityPreviewNode[]) : [],
    }
  } catch {
    return { nodes: [] }
  }
}

export interface ExportPreviewJsonTreeProps {
  jsonContent: string
  testIdPrefix?: string
}

export const ExportPreviewJsonTree = memo(function ExportPreviewJsonTree({
  jsonContent,
  testIdPrefix = 'export-preview',
}: ExportPreviewJsonTreeProps) {
  const document = useMemo(() => parseUnityDocument(jsonContent), [jsonContent])
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => new Set())
  const [rootExpanded, setRootExpanded] = useState(true)

  const toggleNode = useCallback((nodeKey: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(nodeKey)) {
        next.delete(nodeKey)
      } else {
        next.add(nodeKey)
      }
      return next
    })
  }, [])

  if (document.nodes.length === 0 && !document.schemaVersion) {
    return (
      <pre style={blockStyle} data-testid={`${testIdPrefix}-json-raw`}>
        {jsonContent}
      </pre>
    )
  }

  return (
    <div data-testid={`${testIdPrefix}-json-tree`}>
      {document.schemaVersion && (
        <div style={{ marginBottom: '0.5rem', fontSize: '0.8rem', color: theme.text.secondary }}>
          schemaVersion: {document.schemaVersion}
        </div>
      )}
      <button
        type="button"
        style={toggleStyle}
        onClick={() => setRootExpanded((v) => !v)}
        data-testid={`${testIdPrefix}-nodes-toggle`}
      >
        {rootExpanded ? '▼' : '▶'} nodes ({document.nodes.length})
      </button>
      {rootExpanded &&
        document.nodes.map((node, index) => {
          const nodeId = typeof node.id === 'string' ? node.id : `node-${index}`
          const key = `${nodeId}-${index}`
          const expanded = expandedNodes.has(key)
          return (
            <div key={key} style={{ marginLeft: '1rem', marginBottom: '0.35rem' }}>
              <button
                type="button"
                style={toggleStyle}
                onClick={() => toggleNode(key)}
                data-testid={`${testIdPrefix}-node-toggle-${index}`}
              >
                {expanded ? '▼' : '▶'} {nodeId}
              </button>
              {expanded && (
                <pre
                  style={{ ...blockStyle, maxHeight: '25vh', marginTop: '0.25rem' }}
                  data-testid={`${testIdPrefix}-node-body-${index}`}
                >
                  {JSON.stringify(node, null, 2)}
                </pre>
              )}
            </div>
          )
        })}
    </div>
  )
})
