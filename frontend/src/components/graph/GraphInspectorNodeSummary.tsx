/**
 * Onglet NŒUD de l'inspecteur, en **vue lecture** (écran 2e).
 *
 * Le nœud dit trois choses : qui parle, ce qui est dit, et ce que ça coûte
 * structurellement (réponses, flags, conditions). Le formulaire complet reste
 * à un clic — « éditer » bascule sur `NodeEditorPanel`, rien n'est retiré.
 *
 * Toutes les rangées se dérivent des données du nœud : aucune n'est inventée.
 */
import type { ReactNode } from 'react'
import type { Node } from 'reactflow'
import { theme } from '../../theme'
import { redesignFont, redesignText } from '../../theme/redesignTokens'
import { formatVisibilityConditionsSummary } from '../../utils/visibilityConditions'
import type { VisibilityConditionsBlock } from '../../types/visibilityConditions'
import { GraphInspectorRow } from './GraphInspector'

interface NodeChoiceLike {
  text?: string
  test?: string
  effortCost?: number
  consequences?: { flag?: string }
  choiceEffects?: Array<{ flag?: string }>
}

interface RegenerationEntryLike {
  timestamp?: string
  cost?: number
  provider?: string
}

export interface GraphInspectorNodeSummaryProps {
  node: Node
  /** Nombre d'erreurs et d'avertissements de validation portant sur ce nœud. */
  errorCount: number
  warningCount: number
  /** Bascule vers le formulaire d'édition complet. */
  onEdit: () => void
  /** Ouvre l'onglet SANTÉ. */
  onShowHealth: () => void
}

/** Lien discret de fin de rangée (« éditer », « voir »). */
function RowAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: 'none',
        background: 'none',
        padding: 0,
        cursor: 'pointer',
        fontSize: '12px',
        color: redesignText.secondary,
      }}
    >
      {label}
    </button>
  )
}

/** Formate un horodatage ISO en « 3 août, 11:20 » ; rend la chaîne brute si illisible. */
function formatOrigin(timestamp: string): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return timestamp
  return `${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}, ${date.toLocaleTimeString(
    'fr-FR',
    { hour: '2-digit', minute: '2-digit' }
  )}`
}

export function GraphInspectorNodeSummary({
  node,
  errorCount,
  warningCount,
  onEdit,
  onShowHealth,
}: GraphInspectorNodeSummaryProps) {
  const data = (node.data ?? {}) as {
    choices?: NodeChoiceLike[]
    consequences?: { flag?: string }
    visibilityConditions?: VisibilityConditionsBlock
    regenerationHistory?: RegenerationEntryLike[]
    nextNode?: string
  }

  const choices = data.choices ?? []
  const mechanicalChoices = choices.filter((c) => c.test || c.effortCost)
  const flags = Array.from(
    new Set(
      [
        data.consequences?.flag,
        ...choices.flatMap((c) => [c.consequences?.flag, ...(c.choiceEffects ?? []).map((e) => e.flag)]),
      ].filter((f): f is string => Boolean(f))
    )
  )
  const conditionsSummary = formatVisibilityConditionsSummary(data.visibilityConditions)
  const lastGeneration = data.regenerationHistory?.[data.regenerationHistory.length - 1]

  const healthText: ReactNode =
    errorCount === 0 && warningCount === 0 ? (
      'Aucune erreur ni avertissement.'
    ) : (
      <span style={{ color: errorCount > 0 ? theme.state.error.color : theme.state.pending.border }}>
        {errorCount > 0 && `${errorCount} erreur${errorCount > 1 ? 's' : ''}`}
        {errorCount > 0 && warningCount > 0 && ' · '}
        {warningCount > 0 && `${warningCount} avertissement${warningCount > 1 ? 's' : ''}`}
      </span>
    )

  return (
    <div data-testid="graph-inspector-node-summary">
      <GraphInspectorRow label="Réponses" action={<RowAction label="éditer" onClick={onEdit} />}>
        {choices.length === 0
          ? data.nextNode
            ? 'Aucune — le nœud enchaîne directement.'
            : 'Aucune — le dialogue se termine ici.'
          : `${choices.length}${
              mechanicalChoices.length > 0
                ? ` — dont ${mechanicalChoices.length} avec test ou coût`
                : ''
            }`}
      </GraphInspectorRow>

      <GraphInspectorRow label="Flags posés" action={<RowAction label="éditer" onClick={onEdit} />}>
        {flags.length > 0 ? (
          <span style={{ fontFamily: redesignFont.mono, fontSize: '11.5px' }}>
            {flags.join(' · ')}
          </span>
        ) : (
          'Aucun — le nœud ne change pas d’état.'
        )}
      </GraphInspectorRow>

      <GraphInspectorRow
        label="Conditions d’entrée"
        action={<RowAction label="éditer" onClick={onEdit} />}
      >
        {conditionsSummary || 'Aucune — le nœud est toujours atteignable.'}
      </GraphInspectorRow>

      <GraphInspectorRow label="Santé" action={<RowAction label="voir" onClick={onShowHealth} />}>
        {healthText}
      </GraphInspectorRow>

      <GraphInspectorRow label="Origine">
        {lastGeneration?.timestamp ? (
          <span style={{ fontFamily: redesignFont.mono, fontSize: '11.5px' }}>
            {formatOrigin(lastGeneration.timestamp)}
            {lastGeneration.provider ? ` · ${lastGeneration.provider}` : ''}
            {typeof lastGeneration.cost === 'number'
              ? ` · ${lastGeneration.cost.toFixed(2)} $`
              : ''}
          </span>
        ) : (
          'Écrit à la main ou importé — pas de trace de génération.'
        )}
      </GraphInspectorRow>
    </div>
  )
}
