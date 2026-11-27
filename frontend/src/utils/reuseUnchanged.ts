/**
 * Rend le même objet tant que ses entrées ne changent pas (Story 20.2, prototype de cartes) :
 * React Flow ne redessine alors que les cartes et les liens réellement modifiés.
 */
export type ReuseCache<S extends object, R> = WeakMap<S, { inputs: unknown[]; result: R }>

export function reuseUnchanged<S extends object, R>(
  cache: ReuseCache<S, R>,
  source: S,
  inputs: unknown[],
  build: () => R
): R {
  const previous = cache.get(source)
  if (previous && previous.inputs.every((value, index) => Object.is(value, inputs[index]))) {
    return previous.result
  }
  const result = build()
  cache.set(source, { inputs, result })
  return result
}

/** L'ancien ensemble si le contenu est le même : ce qui en dépend n'est pas recalculé. */
export function sameSetOr(previous: Set<string> | null, next: Set<string>): Set<string> {
  if (!previous || previous.size !== next.size) return next
  for (const value of next) if (!previous.has(value)) return next
  return previous
}
