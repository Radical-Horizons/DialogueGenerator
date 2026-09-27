/**
 * Système de toast notifications.
 */
/* eslint-disable react-refresh/only-export-components */
import { useState, useCallback, useEffect } from 'react'
import { theme } from '../../theme'
import {
  redesignFont,
  redesignHairline,
  redesignRadius,
  redesignSpacing,
  redesignText,
} from '../../theme/redesignTokens'

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
  count: number
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

  const dotColor = {
    success: theme.state.success.color,
    error: theme.state.error.color,
    warning: theme.state.warning.color,
    info: theme.state.info.color,
  }[toast.type]
  const heading = toast.type === 'error' ? 'Erreur' : toast.type === 'warning' ? 'Avertissement' : ''
  const hasHeading = heading !== '' || toast.count > 1
  const isError = toast.type === 'error'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: `${redesignSpacing.sm}px`,
        padding: `${redesignSpacing.sm}px ${redesignSpacing.md}px`,
        marginBottom: `${redesignSpacing.sm}px`,
        minWidth: isError ? '400px' : '300px',
        maxWidth: isError ? '600px' : '500px',
        backgroundColor: theme.background.elevated,
        border: `1px solid ${redesignHairline.strong}`,
        borderRadius: `${redesignRadius.control}px`,
        boxShadow: theme.shadow.card,
        animation: 'toastFadeIn 0.2s ease-out',
      }}
    >
      {/* Le point s'aligne sur la première ligne : titre mono si présent, sinon le message. */}
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: dotColor,
          flexShrink: 0,
          marginTop: hasHeading ? 5 : 7,
        }}
      />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: `${redesignSpacing.xs}px` }}>
        {hasHeading && (
          <div
            style={{
              fontFamily: redesignFont.mono,
              fontSize: '10.5px',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: redesignText.secondary,
            }}
          >
            {heading}
            {toast.count > 1 ? ` (x${toast.count})` : ''}
          </div>
        )}
        <span
          style={{
            fontSize: '13px',
            lineHeight: 1.5,
            color: redesignText.body,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {toast.message}
        </span>
        {toast.actions && toast.actions.length > 0 && (
          <div style={{ display: 'flex', gap: `${redesignSpacing.xs}px`, marginTop: `${redesignSpacing.xs}px` }}>
            {toast.actions.map((action, index) => (
              <button
                key={index}
                onClick={() => {
                  action.action()
                  onRemove(toast.id)
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = redesignHairline.rowHover
                  e.currentTarget.style.borderColor = theme.button.default.hover.border
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.borderColor = theme.button.default.border
                }}
                style={{
                  height: 28,
                  padding: `0 ${redesignSpacing.sm}px`,
                  border: `1px solid ${theme.button.default.border}`,
                  borderRadius: `${redesignRadius.control}px`,
                  backgroundColor: 'transparent',
                  color: action.style === 'primary' ? redesignText.strong : redesignText.body,
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: action.style === 'primary' ? 600 : 500,
                  whiteSpace: 'nowrap',
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
          color: redesignText.muted,
          cursor: 'pointer',
          fontSize: '16px',
          lineHeight: 1,
          padding: 0,
          flexShrink: 0,
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
    if (!actions || actions.length === 0) {
      const existingToast = this.toasts.find((toast) => toast.message === message && toast.type === type)
      if (existingToast) {
        this.toasts = this.toasts.map((toast) =>
          toast.id === existingToast.id
            ? { ...toast, count: toast.count + 1, duration }
            : toast
        )
        this.notify()
        return existingToast.id
      }
    }

    const toast: Toast = {
      id: `toast-${toastIdCounter++}`,
      message,
      type,
      duration,
      actions,
      count: 1,
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
          @keyframes toastFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
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

