/**
 * Tests pour PresetValidationModal
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PresetValidationModal } from '../components/generation/PresetValidationModal';
import type { PresetValidationResult } from '../types/preset';

// Mock le theme
vi.mock('../theme', () => ({
  theme: {
    background: {
      primary: '#000',
      secondary: '#111',
      panel: '#222',
    },
    text: {
      primary: '#fff',
      secondary: '#ccc',
    },
    border: {
      primary: '#444',
      secondary: '#333',
    },
    button: {
      primary: {
        background: '#007bff',
        color: '#fff',
      },
    },
    state: {
      primary: '#007bff',
      warning: {
        color: '#ffc107',
      },
      error: {
        color: '#dc3545',
      },
      success: {
        color: '#28a745',
      },
    },
  },
}));

describe('PresetValidationModal', () => {
  const mockOnClose = vi.fn();
  const mockOnConfirm = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should not render when isOpen is false', () => {
      const validationResult: PresetValidationResult = {
        valid: true,
        warnings: [],
        obsoleteRefs: [],
      };

      const { container } = render(
        <PresetValidationModal
          isOpen={false}
          validationResult={validationResult}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it('should render when isOpen is true', () => {
      const validationResult: PresetValidationResult = {
        valid: true,
        warnings: [],
        obsoleteRefs: [],
      };

      render(
        <PresetValidationModal
          isOpen={true}
          validationResult={validationResult}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.getByText(/validation du preset/i)).toBeInTheDocument();
    });
  });

  describe('Valid Preset', () => {
    it('should display success message for valid preset', () => {
      const validationResult: PresetValidationResult = {
        valid: true,
        warnings: [],
        obsoleteRefs: [],
      };

      render(
        <PresetValidationModal
          isOpen={true}
          validationResult={validationResult}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.getByText(/toutes les références sont valides/i)).toBeInTheDocument();
    });

    it('should show Charger button for valid preset', () => {
      const validationResult: PresetValidationResult = {
        valid: true,
        warnings: [],
        obsoleteRefs: [],
      };

      render(
        <PresetValidationModal
          isOpen={true}
          validationResult={validationResult}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.getByText(/charger/i)).toBeInTheDocument();
    });

    it('should call onConfirm when Charger is clicked', () => {
      const validationResult: PresetValidationResult = {
        valid: true,
        warnings: [],
        obsoleteRefs: [],
      };

      render(
        <PresetValidationModal
          isOpen={true}
          validationResult={validationResult}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      const chargerButton = screen.getByText(/charger/i);
      fireEvent.click(chargerButton);

      expect(mockOnConfirm).toHaveBeenCalledOnce();
    });
  });

  describe('Invalid Preset', () => {
    it('should display warnings for invalid preset', () => {
      const validationResult: PresetValidationResult = {
        valid: false,
        warnings: ["Character 'Akthar' not found in GDD", "Location 'Escelion' is obsolete"],
        obsoleteRefs: ['char-001', 'loc-001'],
      };

      render(
        <PresetValidationModal
          isOpen={true}
          validationResult={validationResult}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.getByText(/character 'akthar' not found in gdd/i)).toBeInTheDocument();
      expect(screen.getByText(/location 'escelion' is obsolete/i)).toBeInTheDocument();
    });

    it('should show warning icon for invalid preset', () => {
      const validationResult: PresetValidationResult = {
        valid: false,
        warnings: ['Some warning'],
        obsoleteRefs: [],
      };

      render(
        <PresetValidationModal
          isOpen={true}
          validationResult={validationResult}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.getByText('⚠️')).toBeInTheDocument();
    });

    it('should show "Charger quand même" button for invalid preset', () => {
      const validationResult: PresetValidationResult = {
        valid: false,
        warnings: ['Some warning'],
        obsoleteRefs: [],
      };

      render(
        <PresetValidationModal
          isOpen={true}
          validationResult={validationResult}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.getByText(/charger quand même/i)).toBeInTheDocument();
    });

    it('should call onConfirm when "Charger quand même" is clicked', () => {
      const validationResult: PresetValidationResult = {
        valid: false,
        warnings: ['Some warning'],
        obsoleteRefs: [],
      };

      render(
        <PresetValidationModal
          isOpen={true}
          validationResult={validationResult}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      const chargerButton = screen.getByText(/charger quand même/i);
      fireEvent.click(chargerButton);

      expect(mockOnConfirm).toHaveBeenCalledOnce();
    });
  });

  describe('Close Behavior', () => {
    it('should call onClose when Annuler is clicked', () => {
      const validationResult: PresetValidationResult = {
        valid: true,
        warnings: [],
        obsoleteRefs: [],
      };

      render(
        <PresetValidationModal
          isOpen={true}
          validationResult={validationResult}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      const annulerButton = screen.getByText(/annuler/i);
      fireEvent.click(annulerButton);

      expect(mockOnClose).toHaveBeenCalledOnce();
    });

    it('should call onClose when clicking overlay', () => {
      const validationResult: PresetValidationResult = {
        valid: true,
        warnings: [],
        obsoleteRefs: [],
      };

      const { container } = render(
        <PresetValidationModal
          isOpen={true}
          validationResult={validationResult}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      // Cliquer sur l'overlay (premier div)
      const overlay = container.firstChild as HTMLElement;
      fireEvent.click(overlay);

      expect(mockOnClose).toHaveBeenCalledOnce();
    });

    it('should not close when clicking modal content', () => {
      const validationResult: PresetValidationResult = {
        valid: true,
        warnings: [],
        obsoleteRefs: [],
      };

      render(
        <PresetValidationModal
          isOpen={true}
          validationResult={validationResult}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      const modalContent = screen.getByText(/validation du preset/i).closest('div');
      if (modalContent) {
        fireEvent.click(modalContent);
      }

      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('Obsolete References Display', () => {
    it('should display obsolete refs count', () => {
      const validationResult: PresetValidationResult = {
        valid: false,
        warnings: ['Warning 1', 'Warning 2', 'Warning 3'],
        obsoleteRefs: ['char-001', 'char-002', 'loc-001'],
      };

      render(
        <PresetValidationModal
          isOpen={true}
          validationResult={validationResult}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.getByText(/3 référence\(s\) obsolète\(s\)/i)).toBeInTheDocument();
    });
  });

  describe('Template label', () => {
    it('affiche le libellé template quand entityLabel=template', () => {
      const validationResult: PresetValidationResult = {
        valid: false,
        warnings: ['Personnage inconnu'],
        obsoleteRefs: ['char-ghost'],
      };

      render(
        <PresetValidationModal
          isOpen={true}
          validationResult={validationResult}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          entityLabel="template"
        />
      );

      expect(screen.getByTestId('preset-validation-modal')).toBeInTheDocument();
      expect(screen.getByText(/validation du template/i)).toBeInTheDocument();
      expect(screen.getByTestId('preset-validation-cancel')).toHaveTextContent('Annuler');
      expect(screen.getByTestId('preset-validation-confirm')).toHaveTextContent('Charger quand même');
    });
  });
});
