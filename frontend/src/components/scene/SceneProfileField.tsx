/**
 * Profil d'auteur de la scène : une voix d'écriture ou aucune, `scene.authorProfileId`.
 */
import { useEffect } from 'react'
import { useGraphStore } from '../../store/graphStore'
import { useSceneProfileStore, type SceneVoice } from '../../store/sceneProfileStore'
import { sceneAuthorProfileId, type SceneSheet } from '../../utils/sceneSheet'
import { redesignAccent, redesignText } from '../../theme/redesignTokens'
import { fieldStyle, rowLabel, rowStyle } from './sceneStyles'

export function SceneProfileField({ sheet, readOnly }: { sheet: SceneSheet; readOnly: boolean }) {
  const updateScene = useGraphStore((state) => state.updateScene)
  const voices = useSceneProfileStore((state) => state.voices)
  const status = useSceneProfileStore((state) => state.status)
  const load = useSceneProfileStore((state) => state.load)
  useEffect(() => {
    void load()
  }, [load])

  const profileId = sceneAuthorProfileId(sheet)
  const voice = voices.find((item) => item.id === profileId)

  let note = voice?.description ?? ''
  let warning = false
  if (profileId && !voice) {
    if (status === 'ready') {
      note = 'Profil introuvable (supprimé ou privé) : la génération partira sans profil.'
      warning = true
    } else if (status === 'error') {
      note = 'Profils indisponibles pour le moment.'
      warning = true
    } else {
      note = 'Chargement des profils…'
    }
  } else if (voice && !voice.content.trim()) {
    note = 'Ce profil n’a pas de texte : la génération partira sans profil.'
    warning = true
  }

  const options = (items: SceneVoice[]) =>
    items.map((item) => (
      <option key={item.id} value={item.id}>
        {item.name}
      </option>
    ))
  const own = voices.filter((item) => !item.prebuilt)
  const prebuilt = voices.filter((item) => item.prebuilt)

  return (
    <div style={rowStyle}>
      <span style={rowLabel}>Profil d’auteur</span>
      {readOnly ? (
        <span style={{ fontSize: '13px' }}>
          {voice?.name ?? (profileId ? 'Profil enregistré' : 'Aucun profil.')}
        </span>
      ) : (
        <select
          aria-label="Profil d’auteur"
          value={profileId ?? ''}
          onChange={(event) => {
            const authorProfileId = event.target.value || null
            updateScene((current) => ({ ...current, authorProfileId }))
          }}
          style={{ ...fieldStyle, height: 28, maxWidth: 320, padding: '0 9px' }}
        >
          <option value="">aucun</option>
          {profileId && !voice ? (
            <option value={profileId}>
              {status === 'ready' ? 'profil introuvable' : 'profil enregistré'}
            </option>
          ) : null}
          {own.length > 0 ? <optgroup label="Profils de l’équipe">{options(own)}</optgroup> : null}
          {prebuilt.length > 0 ? (
            <optgroup label="Voix fournies">{options(prebuilt)}</optgroup>
          ) : null}
        </select>
      )}
      {note ? (
        <span
          title={note}
          style={{
            flex: '1 1 220px',
            minWidth: 0,
            fontSize: '12.5px',
            color: warning ? redesignAccent.text : redesignText.secondary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: warning ? 'normal' : 'nowrap',
          }}
        >
          {note}
        </span>
      ) : null}
    </div>
  )
}
