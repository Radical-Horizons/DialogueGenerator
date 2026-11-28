/**
 * « Ce que le modèle saura » (board `Fiche`) : fiches envoyées, brief, ton, profil.
 * Lu dans la même construction que l'envoi.
 */
import { useSceneGeneration } from '../../hooks/useSceneSheet'
import { mentionCatalogs, useSceneCatalogStore } from '../../store/sceneCatalogStore'
import { sceneProfileProblem, useSceneProfileStore } from '../../store/sceneProfileStore'
import { speakerKey, type MentionCategory, type SceneGeneration } from '../../utils/sceneSheet'
import { redesignHairline, redesignSpacing, redesignText } from '../../theme/redesignTokens'
import { monoLabel, rowStyle } from './sceneStyles'

/**
 * Noms des fiches parties au modèle, sans répétition. Un nom libre n'est pas une fiche ;
 * sans catalogue chargé pour sa catégorie, rien ne permet de le dire.
 */
function sentEntryNames(
  selections: SceneGeneration['contextSelections'],
  catalogs: ReturnType<typeof mentionCatalogs>,
): string[] {
  const names = new Map<string, string>()
  for (const [list, value] of Object.entries(selections)) {
    if (!Array.isArray(value)) continue
    const catalog = catalogs[list.replace(/_(full|excerpt)$/, '') as MentionCategory]
    const known = catalog?.length ? new Set(catalog.map((entry) => speakerKey(entry.name))) : null
    for (const name of value as string[]) {
      const key = speakerKey(name)
      if ((!known || known.has(key)) && !names.has(key)) names.set(key, name)
    }
  }
  return [...names.values()]
}

export function SceneContextLine() {
  const generation = useSceneGeneration(null)
  const status = useSceneProfileStore((state) => state.status)
  const voice = useSceneProfileStore((state) =>
    state.voices.find((item) => item.id === generation.authorProfileId),
  )
  const catalog = useSceneCatalogStore()
  const names = sentEntryNames(generation.contextSelections, mentionCatalogs(catalog))

  const extras: string[] = []
  if (generation.brief) extras.push('brief')
  if (generation.narrativeTags) extras.push('ton')
  if (generation.authorProfile) extras.push('profil')
  else if (generation.authorProfileId) {
    const problem = sceneProfileProblem(voice, status)
    if (problem) extras.push(`profil ${problem}`)
  }

  return (
    <div
      data-testid="scene-sheet-knowledge"
      role="group"
      aria-label="Ce que le modèle saura"
      style={{
        ...rowStyle,
        ...monoLabel,
        letterSpacing: '0.05em',
        color: redesignText.muted,
        whiteSpace: 'normal',
        paddingTop: redesignSpacing.md,
        borderTop: `1px solid ${redesignHairline.standard}`,
      }}
    >
      <span style={{ color: redesignText.label }}>Ce que le modèle saura</span>
      <span aria-hidden="true" style={{ width: 20, height: 1, background: redesignHairline.strong }} />
      <span>
        {names.length} fiche{names.length > 1 ? 's' : ''} envoyée{names.length > 1 ? 's' : ''} :{' '}
        <span style={{ color: redesignText.body }}>{names.join(' · ')}</span>
      </span>
      {extras.length > 0 ? (
        <>
          <span aria-hidden="true">·</span>
          <span>{extras.join(' · ')}</span>
        </>
      ) : null}
    </div>
  )
}
