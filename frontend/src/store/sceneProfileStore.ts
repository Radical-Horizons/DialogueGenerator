/**
 * Voix d'écriture que la fiche de scène peut choisir : profils d'auteur visibles (les
 * miens et ceux de l'équipe) et voix fournies. La fiche n'enregistre que l'identifiant ;
 * le texte est relu avant chaque génération.
 */
import { create } from 'zustand'
import * as authorProfilesAPI from '../api/authorProfiles'

export interface SceneVoice {
  id: string
  name: string
  description: string
  content: string
  prebuilt: boolean
}

export type SceneVoiceStatus = 'idle' | 'loading' | 'ready' | 'error'

interface SceneProfileState {
  voices: SceneVoice[]
  /** `error` : au moins une des deux listes manque, un profil absent n'est pas dit supprimé. */
  status: SceneVoiceStatus
  /** Relit les deux listes ; les appels simultanés partagent la même lecture. */
  load: () => Promise<void>
}

/** Pourquoi une génération partirait sans le profil choisi. */
export type SceneProfileProblem = 'introuvable' | 'sans texte' | 'indisponible'

/** `null` quand le profil a son texte, ou tant que la lecture n'a rien dit. */
export function sceneProfileProblem(
  voice: SceneVoice | undefined,
  status: SceneVoiceStatus,
): SceneProfileProblem | null {
  if (voice) return voice.content.trim() ? null : 'sans texte'
  if (status === 'ready') return 'introuvable'
  return status === 'error' ? 'indisponible' : null
}

const PROBLEM_WARNINGS: Record<SceneProfileProblem, string> = {
  introuvable: 'Profil d’auteur de la scène introuvable',
  'sans texte': 'Profil d’auteur de la scène sans texte',
  indisponible: 'Profil d’auteur de la scène indisponible',
}

let inFlight: Promise<void> | null = null

async function readVoices(): Promise<{
  voices: SceneVoice[]
  ownFailed: boolean
  prebuiltFailed: boolean
}> {
  const [own, prebuilt] = await Promise.allSettled([
    authorProfilesAPI.listAuthorProfilesApi(),
    authorProfilesAPI.listPrebuiltAuthorProfilesApi(),
  ])
  const voices: SceneVoice[] = []
  const collect = (result: typeof own | typeof prebuilt, isPrebuilt: boolean) => {
    if (result.status === 'rejected') {
      console.warn('[SceneSheet] Profils d’auteur indisponibles:', result.reason)
      return
    }
    for (const { id, name, description, content } of result.value) {
      voices.push({ id, name, description, content, prebuilt: isPrebuilt })
    }
  }
  collect(own, false)
  collect(prebuilt, true)
  return {
    voices,
    ownFailed: own.status === 'rejected',
    prebuiltFailed: prebuilt.status === 'rejected',
  }
}

export const useSceneProfileStore = create<SceneProfileState>((set, get) => ({
  voices: [],
  status: 'idle',
  load: () => {
    inFlight ??= (async () => {
      if (get().status !== 'ready') set({ status: 'loading' })
      const { voices, ownFailed, prebuiltFailed } = await readVoices()
      // Seule la liste en échec garde ses voix connues : l'autre fait foi.
      const kept = get().voices.filter((known) => (known.prebuilt ? prebuiltFailed : ownFailed))
      set({
        voices: [...voices, ...kept],
        status: ownFailed || prebuiltFailed ? 'error' : 'ready',
      })
    })().finally(() => {
      inFlight = null
    })
    return inFlight
  },
}))

/**
 * Texte du profil de la scène, attendu avant l'envoi. Introuvable, sans texte ou
 * illisible : avertissement et génération sans profil.
 */
export async function resolveSceneAuthorProfile(
  profileId: string | null,
): Promise<string | undefined> {
  if (!profileId) return undefined
  await useSceneProfileStore.getState().load()
  const { voices, status } = useSceneProfileStore.getState()
  const voice = voices.find((item) => item.id === profileId)
  const content = voice?.content.trim()
  if (content) return content
  const problem = sceneProfileProblem(voice, status) ?? 'indisponible'
  const { toastManager } = await import('../components/shared/Toast')
  toastManager.show(
    `${PROBLEM_WARNINGS[problem]} : la génération part sans profil.`,
    'warning',
    8000,
  )
  return undefined
}
