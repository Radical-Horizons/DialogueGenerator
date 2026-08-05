/**
 * Modal pour changer le mot de passe du compte connecté.
 */
import { FormEvent, useState, type CSSProperties } from 'react'
import axios from 'axios'

import * as authAPI from '../../api/auth'
import { theme } from '../../theme'
import { remSize } from '../../theme/uiTypography'
import { TOUCH_TARGET_MIN_PX } from '../../constants'
import { PasswordInput } from '../shared/PasswordInput'

export interface ChangePasswordModalProps {
  isOpen: boolean
  onClose: () => void
}

function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const apiMessage = error.response?.data?.error?.message
    if (typeof apiMessage === 'string' && apiMessage.trim()) {
      return apiMessage
    }
    if (error.response?.status === 401) {
      return 'Mot de passe actuel incorrect.'
    }
  }
  return 'Impossible de changer le mot de passe. Réessayez.'
}

export function ChangePasswordModal({ isOpen, onClose }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const newPasswordBytes = new TextEncoder().encode(newPassword).length

  if (!isOpen) {
    return null
  }

  const resetAndClose = () => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setError(null)
    setSuccess(false)
    setIsSubmitting(false)
    onClose()
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (newPassword !== confirmPassword) {
      setError('La confirmation ne correspond pas au nouveau mot de passe.')
      return
    }
    if (newPasswordBytes > 72) {
      setError('Le nouveau mot de passe dépasse 72 octets UTF-8.')
      return
    }
    setIsSubmitting(true)
    try {
      await authAPI.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      })
      setSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (submitError) {
      setError(errorMessage(submitError))
    } finally {
      setIsSubmitting(false)
    }
  }

  const fieldStyle: CSSProperties = {
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    minHeight: TOUCH_TARGET_MIN_PX,
    padding: '0.55rem 0.7rem',
    color: theme.input.color,
    background: theme.input.background,
    border: `1px solid ${theme.input.border}`,
    borderRadius: 4,
  }

  const passwordContainerStyle: CSSProperties = {
    marginTop: '0.35rem',
  }

  return (
    <div
      role="presentation"
      onClick={resetAndClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: 'rgba(0, 0, 0, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(420px, 100%)',
          padding: '1.25rem',
          background: theme.background.elevated,
          border: `1px solid ${theme.border.primary}`,
          borderRadius: 8,
          color: theme.text.primary,
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
        }}
      >
        <h2
          id="change-password-title"
          style={{ margin: '0 0 1rem', fontSize: remSize('title') }}
        >
          Changer mon mot de passe
        </h2>

        {success ? (
          <div>
            <p role="status" style={{ color: theme.text.primary, marginBottom: '1rem' }}>
              Mot de passe mis à jour.
            </p>
            <button
              type="button"
              onClick={resetAndClose}
              style={{
                minHeight: TOUCH_TARGET_MIN_PX,
                padding: '0.5rem 1rem',
                background: theme.button.primary.background,
                color: theme.button.primary.color,
                border: `1px solid ${theme.border.primary}`,
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Fermer
            </button>
          </div>
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)}>
            <label style={{ display: 'block', marginBottom: '0.75rem' }}>
              Mot de passe actuel
              <PasswordInput
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                containerStyle={passwordContainerStyle}
                style={fieldStyle}
                showLabel="Afficher le mot de passe actuel"
                hideLabel="Masquer le mot de passe actuel"
              />
            </label>
            <label style={{ display: 'block', marginBottom: '0.75rem' }}>
              Nouveau mot de passe
              <PasswordInput
                required
                autoComplete="new-password"
                minLength={8}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                containerStyle={passwordContainerStyle}
                style={fieldStyle}
                showLabel="Afficher le nouveau mot de passe"
                hideLabel="Masquer le nouveau mot de passe"
              />
              <small
                style={{
                  display: 'block',
                  marginTop: '0.25rem',
                  fontSize: remSize('small'),
                  color: newPasswordBytes > 72
                    ? theme.state.error.color
                    : theme.text.secondary,
                }}
              >
                {newPasswordBytes}/72 octets UTF-8
              </small>
            </label>
            <label style={{ display: 'block', marginBottom: '1rem' }}>
              Confirmer le nouveau mot de passe
              <PasswordInput
                required
                autoComplete="new-password"
                minLength={8}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                containerStyle={passwordContainerStyle}
                style={fieldStyle}
                showLabel="Afficher la confirmation"
                hideLabel="Masquer la confirmation"
              />
            </label>

            {error && (
              <div
                role="alert"
                style={{
                  marginBottom: '0.75rem',
                  padding: '0.6rem 0.75rem',
                  color: theme.state.error.color,
                  background: theme.state.error.background,
                  border: `1px solid ${theme.state.error.border}`,
                  borderRadius: 4,
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={resetAndClose}
                disabled={isSubmitting}
                style={{
                  minHeight: TOUCH_TARGET_MIN_PX,
                  padding: '0.5rem 1rem',
                  background: theme.button.default.background,
                  color: theme.button.default.color,
                  border: `1px solid ${theme.border.primary}`,
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  minHeight: TOUCH_TARGET_MIN_PX,
                  padding: '0.5rem 1rem',
                  background: theme.button.primary.background,
                  color: theme.button.primary.color,
                  border: `1px solid ${theme.border.primary}`,
                  borderRadius: 4,
                  cursor: isSubmitting ? 'wait' : 'pointer',
                }}
              >
                {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
