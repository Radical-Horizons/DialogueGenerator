/**
 * La fiche de scène s'écrit-elle ? Non pour un invité ou sans droit d'écriture.
 */
import { useAuthStore } from '../store/authStore'
import { useGraphStore } from '../store/graphStore'

export function useSceneReadOnly(): boolean {
  const canEditDocument = useGraphStore((state) => state.canEditDocument)
  const isGuest = useAuthStore((state) => state.user?.role === 'guest')
  return isGuest || canEditDocument === false
}
