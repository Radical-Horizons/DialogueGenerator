/**
 * Hook pour obtenir une valeur debounced à partir d'une valeur source.
 * Réutilisable pour champs de recherche, filtres, etc.
 */
import { useState, useEffect, useRef } from 'react'

/**
 * Retourne la valeur après un délai (ms) sans changement de la source.
 *
 * @param value - Valeur source (ex. contenu du champ de recherche).
 * @param delayMs - Délai en millisecondes.
 * @returns Valeur debounced (mise à jour après delayMs sans changement).
 */
export function useDebounce<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null
      setDebouncedValue(value)
    }, delayMs)
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [value, delayMs])

  return debouncedValue
}
