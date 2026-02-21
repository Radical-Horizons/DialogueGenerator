/**
 * Tests pour SaveStatusIndicator - Indicateur de statut de sauvegarde
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { SaveStatusIndicator } from '../components/shared/SaveStatusIndicator'

// Mock le theme
vi.mock('../theme', () => ({
  theme: {
    state: {
      success: { color: '#28a745' },
      info: { color: '#17a2b8' },
      warning: { color: '#ffc107' },
      error: { color: '#dc3545' },
    },
  },
}))

describe('SaveStatusIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Status display', () => {
    it('should display "Sauvegardé" when status is saved', () => {
      render(<SaveStatusIndicator status="saved" />)
      expect(screen.getByTitle('Sauvegardé')).toBeInTheDocument()
    })

    it('should display "Sauvegarde…" when status is saving', () => {
      render(<SaveStatusIndicator status="saving" />)
      expect(screen.getByTitle('Sauvegarde…')).toBeInTheDocument()
    })

    it('should display "En attente" when status is unsaved', () => {
      render(<SaveStatusIndicator status="unsaved" />)
      expect(screen.getByTitle('En attente')).toBeInTheDocument()
    })

    it('should display "Erreur" when status is error', () => {
      render(<SaveStatusIndicator status="error" />)
      expect(screen.getByTitle('Erreur')).toBeInTheDocument()
    })
  })

  describe('Relative time display (Task 3 - Story 0.5)', () => {
    it('should display "à l\'instant" when lastSavedAt is less than 5 seconds ago', () => {
      const now = Date.now()
      render(<SaveStatusIndicator status="saved" lastSavedAt={now - 2000} />)
      expect(screen.getByTitle(/Sauvegardé à l'instant/)).toBeInTheDocument()
    })

    it('should display "il y a Xs" when lastSavedAt is less than 60 seconds ago', () => {
      const now = Date.now()
      render(<SaveStatusIndicator status="saved" lastSavedAt={now - 15000} />)
      expect(screen.getByTitle(/Sauvegardé il y a \d+s/)).toBeInTheDocument()
    })

    it('should display "il y a Xmin" when lastSavedAt is less than 60 minutes ago', () => {
      const now = Date.now()
      render(<SaveStatusIndicator status="saved" lastSavedAt={now - 30 * 60 * 1000} />)
      expect(screen.getByTitle(/Sauvegardé il y a \d+min/)).toBeInTheDocument()
    })

    it('should display "il y a Xh" when lastSavedAt is less than 24 hours ago', () => {
      const now = Date.now()
      render(<SaveStatusIndicator status="saved" lastSavedAt={now - 5 * 60 * 60 * 1000} />)
      expect(screen.getByTitle(/Sauvegardé il y a \d+h/)).toBeInTheDocument()
    })

    it('should update relative time every 10 seconds', async () => {
      const now = Date.now()
      render(<SaveStatusIndicator status="saved" lastSavedAt={now - 10000} />)
      
      expect(screen.getByTitle(/Sauvegardé il y a \d+s/)).toBeInTheDocument()
      
      act(() => {
        vi.advanceTimersByTime(15000)
      })
      
      // Après 15s, le titre devrait toujours afficher un temps relatif (25s)
      expect(screen.getByTitle(/Sauvegardé il y a \d+s/)).toBeInTheDocument()
    })
  })

  describe('Error message display (Task 3 - Story 0.5)', () => {
    it('should display error message in title attribute when status is error', () => {
      const errorMessage = 'Quota exceeded'
      render(<SaveStatusIndicator status="error" errorMessage={errorMessage} />)
      
      expect(screen.getByTitle(errorMessage)).toBeInTheDocument()
    })

    it('should not display error message in title when status is not error', () => {
      render(<SaveStatusIndicator status="saved" errorMessage="Some error" />)
      
      // Quand status is saved, le title est le label (Sauvegardé), pas le errorMessage
      expect(screen.getByTitle('Sauvegardé')).toBeInTheDocument()
    })
  })

  describe('Status indicator dot', () => {
    it('should show pulsing animation when status is saving', () => {
      render(<SaveStatusIndicator status="saving" />)
      const container = screen.getByTitle('Sauvegarde…')
      const dot = container.firstElementChild as HTMLElement
      expect(dot).toBeInTheDocument()
      expect(dot.style.animation).toContain('pulse')
    })

    it('should not show pulsing animation when status is not saving', () => {
      render(<SaveStatusIndicator status="saved" />)
      const container = screen.getByTitle('Sauvegardé')
      const dot = container.firstElementChild as HTMLElement
      expect(dot).toBeInTheDocument()
      expect(dot.style.animation).toBe('none')
    })
  })

  describe('ADR-006 sync status labels', () => {
    it('should display "Synced (seq N)" when syncStatusDisplay is synced and ackSeq is set', () => {
      render(
        <SaveStatusIndicator
          status="saved"
          syncStatusDisplay="synced"
          ackSeq={42}
        />
      )
      expect(screen.getByTitle('Synced (seq 42)')).toBeInTheDocument()
    })

    it('should display "Offline, N change(s) queued" when syncStatusDisplay is offline and pendingCount > 0', () => {
      render(
        <SaveStatusIndicator
          status="unsaved"
          syncStatusDisplay="offline"
          pendingCount={2}
        />
      )
      expect(screen.getByTitle('Offline, 2 change(s) queued')).toBeInTheDocument()
    })

    it('should display "Offline" when syncStatusDisplay is offline and pendingCount is 0', () => {
      render(
        <SaveStatusIndicator
          status="saved"
          syncStatusDisplay="offline"
          pendingCount={0}
        />
      )
      expect(screen.getByTitle('Offline')).toBeInTheDocument()
    })

    it('should display "Error" when syncStatusDisplay is error', () => {
      render(
        <SaveStatusIndicator
          status="error"
          syncStatusDisplay="error"
          errorMessage="Network failed"
        />
      )
      expect(screen.getByTitle('Network failed')).toBeInTheDocument()
    })
  })
})
