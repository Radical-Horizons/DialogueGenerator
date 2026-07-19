/**
 * Hook personnalisé pour gérer le profil d'auteur (global, réutilisable).
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import {
  queueUserSettingUpdate,
  subscribeUserSettingsHydration,
} from './useUserSettingsSync'

const SAVED_AUTHOR_PROFILE_KEY = 'dialogue_generator_saved_author_profile'

export function useAuthorProfile() {
  const [authorProfile, setAuthorProfile] = useState<string>('')
  const [savedProfile, setSavedProfile] = useState<string | null>(null)
  const [isLoading] = useState(false)
  const [error] = useState<string | null>(null)
  const isInitialLoad = useRef(true)

  // Charger le profil sauvegardé depuis localStorage au montage
  // Mais vérifier d'abord le draft (generation_draft) qui a la priorité
  useEffect(() => {
    try {
      // Vérifier d'abord le draft qui a la priorité
      const draftSaved = localStorage.getItem('generation_draft')
      if (draftSaved) {
        try {
          const draft = JSON.parse(draftSaved)
          if (draft.authorProfile !== undefined && draft.authorProfile !== '') {
            setSavedProfile(draft.authorProfile)
            setAuthorProfile(draft.authorProfile)
            isInitialLoad.current = false
            return
          }
        } catch (e) {
          // Ignorer les erreurs de parsing du draft
        }
      }
      // Sinon, charger depuis la clé dédiée
      const saved = localStorage.getItem(SAVED_AUTHOR_PROFILE_KEY)
      if (saved) {
        setSavedProfile(saved)
        setAuthorProfile(saved)
      }
      isInitialLoad.current = false
    } catch (err) {
      console.warn('Impossible de charger le profil d\'auteur sauvegardé depuis localStorage:', err)
      isInitialLoad.current = false
    }
  }, [])

  useEffect(
    () =>
      subscribeUserSettingsHydration((settings) => {
        const serverProfile = settings.generation?.author_profile
        if (typeof serverProfile !== 'string') return
        setSavedProfile(serverProfile)
        setAuthorProfile(serverProfile)
        isInitialLoad.current = false
      }),
    [],
  )

  const saveProfile = useCallback((profile: string) => {
    try {
      localStorage.setItem(SAVED_AUTHOR_PROFILE_KEY, profile)
      setSavedProfile(profile)
      queueUserSettingUpdate('generation', 'author_profile', profile)
    } catch (err) {
      console.error('Erreur lors de la sauvegarde du profil d\'auteur:', err)
      throw new Error('Impossible de sauvegarder le profil d\'auteur')
    }
  }, [])

  const restore = useCallback(() => {
    // Lire le profil sauvegardé depuis localStorage
    let saved: string | null = null
    try {
      saved = localStorage.getItem(SAVED_AUTHOR_PROFILE_KEY)
    } catch (err) {
      console.warn('Impossible de lire le profil d\'auteur sauvegardé:', err)
    }
    
    // Restaurer la dernière version sauvegardée, ou vide si rien n'est sauvegardé
    if (saved) {
      setSavedProfile(saved)
      setAuthorProfile(saved)
    } else {
      setAuthorProfile('')
    }
  }, [])

  const updateProfile = useCallback((profile: string) => {
    setAuthorProfile(profile)
  }, [])

  // Sauvegarde automatique dans localStorage à chaque modification
  useEffect(() => {
    // Ignorer le chargement initial
    if (isInitialLoad.current) {
      return
    }
    
    // Sauvegarder seulement si la valeur a changé par rapport à ce qui est sauvegardé
    if (authorProfile !== savedProfile) {
      try {
        localStorage.setItem(SAVED_AUTHOR_PROFILE_KEY, authorProfile)
        setSavedProfile(authorProfile)
        queueUserSettingUpdate('generation', 'author_profile', authorProfile)
      } catch (err) {
        console.warn('Impossible de sauvegarder automatiquement le profil d\'auteur:', err)
      }
    }
  }, [authorProfile, savedProfile])

  return {
    authorProfile,
    savedProfile,
    isLoading,
    error,
    saveProfile,
    restore,
    updateProfile,
  }
}

