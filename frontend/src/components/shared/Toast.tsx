/**
 * Système de toast notifications.
 */
/* eslint-disable react-refresh/only-export-components */
import { useState, useCallback, useEffect } from 'react'
import { theme } from '../../theme'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastAction {
  label: string
  action: () => void
  style?: 'primary' | 'secondary'
}

export interface Toast {
  id: string
  message: string
  type: ToastType
  duration?: number
  actions?: ToastAction[]
}

interface ToastProps {
  toast: Toast
  onRemove: (id: string) => void
}

function ToastComponent({ toast, onRemove }: ToastProps) {
  useEffect(() => {
    // Les erreurs durent plus longtemps (30 secondes) pour être bien visibles
    const defaultDuration = toast.type === 'error' ? 30000 : 5000
    const duration = toast.duration ?? defaultDuration
    const timer = setTimeout(() => {
      onRemove(toast.id)
    }, duration)

    return () => clearTimeout(timer)
  }, [toast, onRemove])

  const getStyles = () => {
    const baseStyles: React.CSSProperties = {
      padding: '0.75rem 1rem',
      borderRadius: '4px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
      marginBottom: '0.5rem',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      minWidth: '300px',
      maxWidth: '500px',
      animation: 'slideIn 0.3s ease-out',
    }

    switch (toast.type) {
      case 'success':
        return {
          ...baseStyles,
          backgroundColor: theme.state.success.background,
          color: theme.state.success.color,
          borderLeft: `4px solid ${theme.state.success.color}`,
        }
      case 'error':
        return {
          ...baseStyles,
          backgroundColor: theme.state.error.background,
          color: theme.state.error.color,
          borderLeft: `4px solid ${theme.state.error.border}`,
          border: `2px solid ${theme.state.error.border}`,
          minWidth: '400px',
          maxWidth: '600px',
        }
      case 'warning':
        return {
          ...baseStyles,
          backgroundColor: '#3a3a1a',
          color: '#ffd43b',
          borderLeft: '4px solid #ffd43b',
        }
      case 'info':
      default:
        return {
          ...baseStyles,
          backgroundColor: theme.state.info.background,
          color: theme.state.info.color,
          borderLeft: `4px solid ${theme.state.info.color}`,
        }
    }
  }

  return (
    <div style={getStyles()}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
          {toast.type === 'error' && (
            <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>⚠️</span>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: toast.type === 'error' ? 'bold' : 'normal', marginBottom: toast.type === 'error' ? '0.25rem' : 0 }}>
              {toast.type === 'error' ? 'Erreur' : toast.type === 'warning' ? 'Avertissement' : ''}
            </div>
            <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{toast.message}</span>
          </div>
        </div>
        {toast.actions && toast.actions.length > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
            {toast.actions.map((action, index) => (
              <button
                key={index}
                onClick={() => {
                  action.action()
                  onRemove(toast.id)
                }}
                style={{
                  padding: '0.25rem 0.75rem',
                  border: action.style === 'secondary' ? `1px solid ${theme.border.primary}` : 'none',
                  borderRadius: '4px',
                  backgroundColor:
                    action.style === 'secondary'
                      ? theme.button.default.background
                      : 'rgba(255, 255, 255, 0.2)',
                  color: 'inherit',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: action.style === 'primary' ? 'bold' : 'normal',
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={() => onRemove(toast.id)}
        style={{
          background: 'none',
          border: 'none',
          color: 'inherit',
          cursor: 'pointer',
          fontSize: '1.2rem',
          lineHeight: 1,
          marginLeft: '1rem',
          opacity: 0.7,
          padding: 0,
          alignSelf: 'flex-start',
        }}
        aria-label="Fermer"
      >
        ×
      </button>
    </div>
  )
}

let toastIdCounter = 0

class ToastManager {
  private listeners: Set<(toasts: Toast[]) => void> = new Set()
  private toasts: Toast[] = []

  subscribe(listener: (toasts: Toast[]) => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify() {
    this.listeners.forEach((listener) => listener([...this.toasts]))
  }

  show(message: string, type: ToastType = 'info', duration?: number, actions?: ToastAction[]) {
    const toast: Toast = {
      id: `toast-${toastIdCounter++}`,
      message,
      type,
      duration,
      actions,
    }
    this.toasts.push(toast)
    this.notify()
    return toast.id
  }

  remove(id: string) {
    this.toasts = this.toasts.filter((t) => t.id !== id)
    this.notify()
  }

  clear() {
    this.toasts = []
    this.notify()
  }

  getToasts(): Toast[] {
    return [...this.toasts]
  }
}

export const toastManager = new ToastManager()

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const unsubscribe = toastManager.subscribe(setToasts)
    return unsubscribe
  }, [])

  const handleRemove = useCallback((id: string) => {
    toastManager.remove(id)
  }, [])

  if (toasts.length === 0) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: '1rem',
        right: '1rem',
        zIndex: 10000,
        pointerEvents: 'none',
      }}
    >
      <style>
        {`
          @keyframes slideIn {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
        `}
      </style>
      <div style={{ pointerEvents: 'auto' }}>
        {toasts.map((toast) => (
          <ToastComponent key={toast.id} toast={toast} onRemove={handleRemove} />
        ))}
      </div>
    </div>
  )
}

/** Type de la fonction retournée par useToast, pour typage des hooks qui la reçoivent en paramètre. */
export type UseToastFn = (
  message: string,
  type?: ToastType,
  duration?: number,
  actions?: ToastAction[]
) => string

export function useToast() {
  return useCallback<UseToastFn>(
    (message: string, type: ToastType = 'info', duration?: number, actions?: ToastAction[]) => {
      return toastManager.show(message, type, duration, actions)
    },
    []
  )
}

