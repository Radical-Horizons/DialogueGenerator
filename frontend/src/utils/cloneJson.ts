/**
 * Même résultat que `JSON.parse(JSON.stringify(value))` pour des données de dialogue, sans
 * réécrire les chaînes : elles sont immuables et se partagent. À 500 répliques, l'instantané
 * d'annulation pris au début d'un glisser coûtait une image entière (Story 20.2).
 */
export function cloneJson<T>(value: T): T {
  return cloneValue(value) as T
}

function cloneValue(value: unknown): unknown {
  // `+ 0` : comme JSON, -0 devient 0.
  if (typeof value === 'number') return Number.isFinite(value) ? value + 0 : null
  if (value === null || typeof value !== 'object') return value
  const withToJson = value as { toJSON?: () => unknown }
  if (typeof withToJson.toJSON === 'function') return cloneValue(withToJson.toJSON())
  if (Array.isArray(value)) {
    return value.map((item) => (isOmitted(item) ? null : cloneValue(item)))
  }
  const source = value as Record<string, unknown>
  const copy: Record<string, unknown> = {}
  for (const key of Object.keys(source)) {
    if (!isOmitted(source[key])) copy[key] = cloneValue(source[key])
  }
  return copy
}

const isOmitted = (value: unknown) =>
  value === undefined || typeof value === 'function' || typeof value === 'symbol'
