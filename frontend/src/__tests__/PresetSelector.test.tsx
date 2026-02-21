/**
 * Tests pour PresetSelector
 */
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { PresetSelector } from '../components/generation/PresetSelector';
import { usePresetStore } from '../store/presetStore';
import type { Preset } from '../types/preset';

// Mock le store
vi.mock('../store/presetStore');

// Mock le theme (complet pour SaveStatusIndicator importé via shared)
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
      error: { color: '#dc3545' },
      success: { color: '#28a745' },
      info: { color: '#17a2b8' },
      warning: { color: '#ffc107' },
    },
  },
}));

describe('PresetSelector', () => {
  const mockPreset: Preset = {
    id: 'test-id',
    name: 'Test Preset',
    icon: '🎭',
    metadata: {
      created: '2026-01-17T10:00:00Z',
      modified: '2026-01-17T10:00:00Z',
    },
    configuration: {
      characters: ['char-001'],
      locations: ['loc-001'],
      region: 'Test Region',
      subLocation: 'Test SubLocation',
      sceneType: 'Première rencontre',
      instructions: 'Test instructions',
    },
  };

  const mockLoadPresets = vi.fn();
  const mockCreatePreset = vi.fn();
  const mockDeletePreset = vi.fn();
  const mockSetSelectedPreset = vi.fn();
  const mockOnPresetLoaded = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock du store par défaut
    (usePresetStore as unknown as Mock).mockReturnValue({
      presets: [mockPreset],
      selectedPreset: null,
      isLoading: false,
      error: null,
      loadPresets: mockLoadPresets,
      createPreset: mockCreatePreset,
      deletePreset: mockDeletePreset,
      setSelectedPreset: mockSetSelectedPreset,
    });
  });

  describe('Rendering', () => {
    it('should render preset selector', () => {
      render(<PresetSelector onPresetLoaded={mockOnPresetLoaded} />);

      expect(screen.getByText(/charger preset/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sauvegarder/i })).toBeInTheDocument();
    });

    it('should load presets on mount', () => {
      render(<PresetSelector onPresetLoaded={mockOnPresetLoaded} />);

      expect(mockLoadPresets).toHaveBeenCalledOnce();
    });

    it('should show "Aucun preset" message when list is empty', () => {
      (usePresetStore as unknown as Mock).mockReturnValue({
        presets: [],
        selectedPreset: null,
        isLoading: false,
        error: null,
        loadPresets: mockLoadPresets,
        createPreset: mockCreatePreset,
        deletePreset: mockDeletePreset,
        setSelectedPreset: mockSetSelectedPreset,
      });

      render(<PresetSelector onPresetLoaded={mockOnPresetLoaded} />);

      // Ouvrir dropdown
      const dropdown = screen.getByText(/charger preset/i);
      fireEvent.click(dropdown);

      expect(screen.getByText(/aucun preset sauvegardé/i)).toBeInTheDocument();
    });
  });

  describe('Preset Loading', () => {
    it('should display preset list in dropdown', async () => {
      render(<PresetSelector onPresetLoaded={mockOnPresetLoaded} />);

      // Ouvrir dropdown
      const dropdown = screen.getByText(/charger preset/i);
      fireEvent.click(dropdown);

      await waitFor(() => {
        expect(screen.getByText(mockPreset.name)).toBeInTheDocument();
      });
    });

    it('should call onPresetLoaded when preset is selected', async () => {
      render(<PresetSelector onPresetLoaded={mockOnPresetLoaded} />);

      // Ouvrir dropdown
      const dropdown = screen.getByText(/charger preset/i);
      fireEvent.click(dropdown);

      // Sélectionner preset
      const presetItem = await screen.findByText(mockPreset.name);
      fireEvent.click(presetItem);

      await waitFor(() => {
        expect(mockSetSelectedPreset).toHaveBeenCalledWith(mockPreset);
        expect(mockOnPresetLoaded).toHaveBeenCalledWith(mockPreset);
      });
    });
  });

  describe('Preset Creation', () => {
    it('should open modal when "Sauvegarder preset" is clicked', async () => {
      const mockCurrentConfiguration = {
        characters: ['char-001'],
        locations: ['loc-001'],
        region: 'Test Region',
        sceneType: 'Première rencontre',
        instructions: 'Test instructions',
      };

      render(
        <PresetSelector
          onPresetLoaded={mockOnPresetLoaded}
          currentConfiguration={mockCurrentConfiguration}
        />
      );

      const saveButton = screen.getByRole('button', { name: /sauvegarder/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/nouveau preset/i)).toBeInTheDocument();
      });
    });

    it('should create preset with provided data', async () => {
      const mockCurrentConfiguration = {
        characters: ['char-001'],
        locations: ['loc-001'],
        region: 'Test Region',
        sceneType: 'Première rencontre',
        instructions: 'Test instructions',
      };

      render(
        <PresetSelector
          onPresetLoaded={mockOnPresetLoaded}
          currentConfiguration={mockCurrentConfiguration}
        />
      );

      // Ouvrir modal
      const saveButton = screen.getByRole('button', { name: /sauvegarder/i });
      fireEvent.click(saveButton);

      // Remplir formulaire
      const nameInput = await screen.findByLabelText(/nom/i);
      fireEvent.change(nameInput, { target: { value: 'New Preset' } });

      // Sauvegarder
      const createButton = screen.getByText(/créer/i);
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(mockCreatePreset).toHaveBeenCalledWith({
          name: 'New Preset',
          icon: '📋',
          configuration: mockCurrentConfiguration,
        });
      });
    });
  });

  describe('Preset Deletion', () => {
    it('should delete preset when delete is confirmed', async () => {
      render(<PresetSelector onPresetLoaded={mockOnPresetLoaded} />);

      // Ouvrir dropdown
      const dropdown = screen.getByText(/charger preset/i);
      fireEvent.click(dropdown);

      // Trouver bouton supprimer par son title attribute
      const deleteButton = await screen.findByTitle(/supprimer/i);
      fireEvent.click(deleteButton);

      // Confirmer suppression
      const confirmButton = await screen.findByText(/confirmer/i);
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockDeletePreset).toHaveBeenCalledWith(mockPreset.id);
      });
    });
  });

  describe('Loading State', () => {
    it('should show loading indicator when loading presets', () => {
      (usePresetStore as unknown as Mock).mockReturnValue({
        presets: [],
        selectedPreset: null,
        isLoading: true,
        error: null,
        loadPresets: mockLoadPresets,
        createPreset: mockCreatePreset,
        deletePreset: mockDeletePreset,
        setSelectedPreset: mockSetSelectedPreset,
      });

      render(<PresetSelector onPresetLoaded={mockOnPresetLoaded} />);

      // Ouvrir dropdown
      const dropdown = screen.getByText(/charger preset/i);
      fireEvent.click(dropdown);

      expect(screen.getByText(/chargement/i)).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should display error message when loading fails', () => {
      (usePresetStore as unknown as Mock).mockReturnValue({
        presets: [],
        selectedPreset: null,
        isLoading: false,
        error: 'Failed to load presets',
        loadPresets: mockLoadPresets,
        createPreset: mockCreatePreset,
        deletePreset: mockDeletePreset,
        setSelectedPreset: mockSetSelectedPreset,
      });

      render(<PresetSelector onPresetLoaded={mockOnPresetLoaded} />);

      expect(screen.getByText(/failed to load presets/i)).toBeInTheDocument();
    });
  });
});
