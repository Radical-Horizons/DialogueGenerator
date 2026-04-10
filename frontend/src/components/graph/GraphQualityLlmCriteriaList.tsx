import type { DialogueQualityCriterionDetail } from '../../types/graph'

interface GraphQualityLlmCriteriaListProps {
  criteria: DialogueQualityCriterionDetail[]
}

/**
 * Liste des critères du rapport juge (sous-composant du panneau FR42).
 */
export function GraphQualityLlmCriteriaList({ criteria }: GraphQualityLlmCriteriaListProps) {
  return (
    <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
      {criteria.map((c) => (
        <li key={c.criterion_id} data-testid={`quality-criterion-${c.criterion_id}`}>
          <strong>{c.label}</strong> — {c.score}/10 : {c.comment}
        </li>
      ))}
    </ul>
  )
}
