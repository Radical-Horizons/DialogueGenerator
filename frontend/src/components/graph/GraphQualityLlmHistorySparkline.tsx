/**
 * Mini série des scores d’évaluation session (FR42 AC #5).
 */
interface ScorePoint {
  score: number
}

interface GraphQualityLlmHistorySparklineProps {
  history: ScorePoint[]
}

const W = 200
const H = 48
const PAD = 6

/**
 * Affiche une sparkline SVG des scores globaux successifs.
 */
export function GraphQualityLlmHistorySparkline({
  history,
}: GraphQualityLlmHistorySparklineProps) {
  if (history.length === 0) return null
  const scores = history.map((h) => h.score)
  const minS = Math.min(...scores, 0)
  const maxS = Math.max(...scores, 10)
  const span = Math.max(1e-6, maxS - minS)
  const innerW = W - PAD * 2
  const innerH = H - PAD * 2
  const pts = scores.map((s, i) => {
    const x = PAD + (scores.length === 1 ? innerW / 2 : (i / (scores.length - 1)) * innerW)
    const y = PAD + innerH - ((s - minS) / span) * innerH
    return `${x},${y}`
  })
  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      aria-label="Historique des scores"
      role="img"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        points={pts.join(' ')}
      />
      {scores.map((s, i) => {
        const x = PAD + (scores.length === 1 ? innerW / 2 : (i / (scores.length - 1)) * innerW)
        const y = PAD + innerH - ((s - minS) / span) * innerH
        return <circle key={i} cx={x} cy={y} r={3} fill="currentColor" />
      })}
    </svg>
  )
}
