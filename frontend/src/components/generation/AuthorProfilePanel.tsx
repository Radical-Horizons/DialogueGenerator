/**
 * Profil d'auteur — section du tiroir de réglages.
 *
 * Le profil décrit la **voix** persistante du projet. Le champ est la valeur active
 * (envoyée au LLM) ; les profils nommés sont des objets serveur, avec propriété et
 * statut privé/partagé — même modèle que les templates.
 *
 * Les modèles « ce navigateur » ont disparu : ils vivaient en `localStorage` et se
 * perdaient au changement de machine. Ils migrent au premier montage.
 */
import { useCallback, useEffect, useState } from 'react'
import { FormField } from '../shared/FormField'
import { useToast } from '../shared'
import { theme } from '../../theme'
import { generationPanelChrome } from '../../theme/responsiveChrome'
import { useGenerationPanelNarrow } from './GenerationPanelNarrowContext'
import { migrateLocalAuthorProfiles } from '../../utils/migrateLocalAuthorProfiles'
import {
  createAuthorProfileApi,
  deleteAuthorProfileApi,
  listAuthorProfilesApi,
  listPrebuiltAuthorProfilesApi,
  updateAuthorProfileApi,
  type AuthorProfile,
  type PrebuiltAuthorProfile,
} from '../../api/authorProfiles'
import {
  redesignAccent,
  redesignFont,
  redesignHairline,
  redesignText,
} from '../../theme/redesignTokens'

export interface AuthorProfilePanelProps {
  authorProfile: string
  onAuthorProfileChange: (profile: string) => void
}

/** Pastille de statut : discrète pour « partagé », marquée pour un brouillon. */
function chipStyle(visibility: 'shared' | 'private'): React.CSSProperties {
  const draft = visibility === 'private'
  return {
    appearance: 'none',
    height: 18,
    padding: '0 8px',
    borderRadius: 99,
    fontSize: '10.5px',
    fontFamily: redesignFont.mono,
    letterSpacing: '0.06em',
    cursor: 'pointer',
    border: `1px solid ${draft ? redesignAccent.ring : redesignHairline.strong}`,
    background: draft ? redesignAccent.selectedBg : 'transparent',
    color: draft ? redesignAccent.light : redesignText.muted,
  }
}

export function AuthorProfilePanel({
  authorProfile,
  onAuthorProfileChange,
}: AuthorProfilePanelProps) {
  const toast = useToast()
  const isNarrow = useGenerationPanelNarrow()
  const genChrome = isNarrow ? generationPanelChrome.narrow : generationPanelChrome.comfortable

  const [profiles, setProfiles] = useState<AuthorProfile[]>([])
  const [prebuilt, setPrebuilt] = useState<PrebuiltAuthorProfile[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [saveAsName, setSaveAsName] = useState('')

  const reload = useCallback(async () => {
    setIsLoading(true)
    try {
      setProfiles(await listAuthorProfilesApi())
    } catch (err) {
      console.error('Chargement des profils d’auteur impossible:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void listPrebuiltAuthorProfilesApi()
      .then(setPrebuilt)
      .catch((err) => console.error('Catalogue de voix indisponible:', err))
    // Les profils du navigateur rejoignent le serveur au premier passage ; un échec
    // laisse la migration ouverte sans empêcher la liste de s'afficher.
    void migrateLocalAuthorProfiles()
      .catch((err) => console.warn('Migration des profils locaux différée:', err))
      .finally(() => {
        void reload()
      })
  }, [reload])

  const applyProfile = (content: string, name: string) => {
    onAuthorProfileChange(content)
    toast(`Profil « ${name} » appliqué`, 'success')
  }

  const handleSaveAs = async () => {
    const name = saveAsName.trim()
    if (!name) {
      toast('Donnez un nom au profil', 'error')
      return
    }
    try {
      await createAuthorProfileApi({ name, content: authorProfile })
      setSaveAsName('')
      await reload()
      toast(`Profil « ${name} » enregistré`, 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Enregistrement impossible', 'error')
    }
  }

  const handleToggleVisibility = async (profile: AuthorProfile) => {
    const next = profile.visibility === 'private' ? 'shared' : 'private'
    try {
      await updateAuthorProfileApi(profile.id, { visibility: next })
      await reload()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Changement de statut impossible', 'error')
    }
  }

  const handleDelete = async (profile: AuthorProfile) => {
    try {
      await deleteAuthorProfileApi(profile.id)
      await reload()
      toast(`Profil « ${profile.name} » supprimé`, 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Suppression impossible', 'error')
    }
  }

  const label: React.CSSProperties = {
    fontFamily: redesignFont.mono,
    fontSize: '10px',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: redesignText.label,
    marginBottom: 9,
    display: 'block',
  }

  return (
    <div style={{ padding: genChrome.tabInnerPadding, minWidth: 0 }}>
      <div style={{ marginBottom: 20 }}>
        <span style={label}>Voix fournies</span>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }} data-testid="prebuilt-voices">
          {prebuilt.map((voice) => (
            <button
              key={voice.id}
              type="button"
              data-testid="prebuilt-voice-item"
              data-voice-id={voice.id}
              onClick={() => applyProfile(voice.content, voice.name)}
              title={voice.description}
              style={{
                height: 25,
                padding: '0 10px',
                borderRadius: 99,
                border: `1px solid ${redesignHairline.strong}`,
                background: 'transparent',
                color: redesignText.secondary,
                fontSize: '11.5px',
                cursor: 'pointer',
              }}
            >
              {voice.name}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 20 }} data-testid="author-profiles-list">
        <span style={label}>Mes profils et ceux de l’équipe</span>
        {isLoading ? (
          <div style={{ color: theme.text.secondary, fontSize: '0.85rem' }}>Chargement…</div>
        ) : profiles.length === 0 ? (
          <div
            data-testid="author-profiles-empty"
            style={{ color: theme.text.secondary, fontSize: '0.85rem' }}
          >
            Aucun profil enregistré. Écrivez une voix ci-dessous et donnez-lui un nom.
          </div>
        ) : (
          profiles.map((profile) => (
            <div
              key={profile.id}
              data-testid="author-profile-item"
              data-profile-name={profile.name}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 9,
                flexWrap: 'wrap',
                padding: '7px 0',
                borderTop: `1px solid ${redesignHairline.standard}`,
              }}
            >
              <button
                type="button"
                data-testid="author-profile-apply"
                onClick={() => applyProfile(profile.content, profile.name)}
                style={{
                  border: 'none',
                  background: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  color: theme.text.primary,
                  fontWeight: 600,
                  fontSize: '13px',
                }}
              >
                {profile.name}
              </button>
              {profile.relation === 'owned' ? (
                <button
                  type="button"
                  data-testid="author-profile-visibility-toggle"
                  data-visibility={profile.visibility}
                  onClick={() => void handleToggleVisibility(profile)}
                  title={
                    profile.visibility === 'private'
                      ? 'Brouillon visible de vous seul — cliquer pour partager'
                      : "Visible de l'équipe — cliquer pour repasser en brouillon"
                  }
                  style={chipStyle(profile.visibility)}
                >
                  {profile.visibility === 'private' ? 'privé' : 'partagé'}
                </button>
              ) : (
                <span style={{ fontSize: '10.5px', color: redesignText.muted }}>
                  {profile.relation === 'team' ? 'équipe' : ''}
                </span>
              )}
              {profile.relation === 'owned' && (
                <button
                  type="button"
                  data-testid="author-profile-delete"
                  onClick={() => void handleDelete(profile)}
                  style={{
                    marginLeft: 'auto',
                    border: 'none',
                    background: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    fontSize: '11.5px',
                    color: theme.state.error.color,
                  }}
                >
                  Supprimer
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <FormField label="" htmlFor="author-profile-textarea">
        <span style={label}>Voix appliquée</span>
        <textarea
          id="author-profile-textarea"
          data-testid="author-profile-textarea"
          value={authorProfile}
          onChange={(e) => onAuthorProfileChange(e.target.value)}
          rows={8}
          placeholder="Ex : phrases courtes, peu d'adjectifs, dialogues qui coupent."
          style={{
            width: '100%',
            padding: '0.65rem 0.75rem',
            boxSizing: 'border-box',
            backgroundColor: theme.input.background,
            border: `1px solid ${theme.input.border}`,
            color: theme.input.color,
            borderRadius: '6px',
            fontFamily: 'inherit',
            fontSize: '0.9rem',
            resize: 'vertical',
            lineHeight: 1.55,
          }}
        />
      </FormField>

      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 9 }}>
        <input
          data-testid="author-profile-save-name"
          value={saveAsName}
          onChange={(e) => setSaveAsName(e.target.value)}
          placeholder="Nom du profil"
          style={{
            flex: '1 1 180px',
            minWidth: 0,
            padding: '0.45rem 0.6rem',
            borderRadius: 6,
            border: `1px solid ${theme.input.border}`,
            backgroundColor: theme.input.background,
            color: theme.input.color,
            fontSize: '0.85rem',
          }}
        />
        <button
          type="button"
          data-testid="author-profile-save-btn"
          onClick={() => void handleSaveAs()}
          style={{
            padding: '0.45rem 0.85rem',
            border: `1px solid ${theme.border.secondary}`,
            borderRadius: 6,
            backgroundColor: theme.button.default.background,
            color: theme.button.default.color,
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 600,
          }}
        >
          Enregistrer comme profil
        </button>
      </div>
    </div>
  )
}
