/**
 * Tests pour usePresetStore - Store Zustand pour gestion des presets
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePresetStore } from '../store/presetStore';

// Mock fetch global
global.fetch = vi.fn();

describe('usePresetStore', () => {
  beforeEach(() => {
    // Réinitialiser le mock fetch avant chaque test
    vi.clearAllMocks();
    
    // Réinitialiser le store à l'état initial
    const { result } = renderHook(() => usePresetStore());
    act(() => {
      result.current.reset();
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should have initial state', () => {
      const { result } = renderHook(() => usePresetStore());

      expect(result.current.presets).toEqual([]);
      expect(result.current.selectedPreset).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('loadPresets', () => {
    it('should load presets successfully', async () => {
      const mockPresets = [
        {
          id: '1',
          name: 'Test Preset 1',
          icon: '🎭',
          metadata: { created: '2026-01-17T10:00:00Z', modified: '2026-01-17T10:00:00Z' },
          configuration: {
            characters: ['char-001'],
            locations: ['loc-001'],
            region: 'Test Region',
            subLocation: 'Test SubLocation',
            sceneType: 'Première rencontre',
            instructions: 'Test instructions',
          },
        },
      ];

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockPresets,
      });

      const { result } = renderHook(() => usePresetStore());

      await act(async () => {
        await result.current.loadPresets();
      });

      expect(result.current.presets).toEqual(mockPresets);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should set loading state while loading presets', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, json: async () => [] }), 100))
      );

      const { result } = renderHook(() => usePresetStore());

      act(() => {
        result.current.loadPresets();
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should handle error when loading presets fails', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const { result } = renderHook(() => usePresetStore());

      await act(async () => {
        await result.current.loadPresets();
      });

      expect(result.current.error).toContain('Failed to load presets');
      expect(result.current.isLoading).toBe(false);
    });

    it('should handle network error when loading presets', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => usePresetStore());

      await act(async () => {
        await result.current.loadPresets();
      });

      expect(result.current.error).toContain('Network error');
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('createPreset', () => {
    it('should create preset successfully', async () => {
      const newPresetData = {
        name: 'New Preset',
        icon: '🎨',
        configuration: {
          characters: ['char-001'],
          locations: ['loc-001'],
          region: 'Test Region',
          sceneType: 'Confrontation',
          instructions: 'Test instructions',
        },
      };

      const createdPreset = {
        id: 'new-id',
        ...newPresetData,
        metadata: { created: '2026-01-17T10:00:00Z', modified: '2026-01-17T10:00:00Z' },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => createdPreset,
      });

      const { result } = renderHook(() => usePresetStore());

      await act(async () => {
        await result.current.createPreset(newPresetData);
      });

      expect(result.current.presets).toContainEqual(createdPreset);
      expect(result.current.error).toBeNull();
    });

    it('should handle error when creating preset fails', async () => {
      const newPresetData = {
        name: 'New Preset',
        icon: '🎨',
        configuration: {
          characters: [],
          locations: [],
          region: 'Test',
          sceneType: 'Test',
          instructions: '',
        },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const { result } = renderHook(() => usePresetStore());

      await act(async () => {
        try {
          await result.current.createPreset(newPresetData);
        } catch (error) {
          // L'erreur est lancée, ce qui est le comportement attendu
        }
      });

      expect(result.current.error).toContain('Failed to create preset');
    });
  });

  describe('updatePreset', () => {
    it('should update preset successfully', async () => {
      const existingPreset = {
        id: '1',
        name: 'Original Name',
        icon: '🎭',
        metadata: { created: '2026-01-17T10:00:00Z', modified: '2026-01-17T10:00:00Z' },
        configuration: {
          characters: ['char-001'],
          locations: ['loc-001'],
          region: 'Test Region',
          sceneType: 'Test',
          instructions: 'Test',
        },
      };

      const updatedPreset = {
        ...existingPreset,
        name: 'Updated Name',
        metadata: { ...existingPreset.metadata, modified: '2026-01-17T11:00:00Z' },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => updatedPreset,
      });

      const { result } = renderHook(() => usePresetStore());

      // Setup initial state
      act(() => {
        result.current.presets = [existingPreset];
      });

      await act(async () => {
        await result.current.updatePreset('1', { name: 'Updated Name' });
      });

      expect(result.current.presets[0].name).toBe('Updated Name');
      expect(result.current.error).toBeNull();
    });

    it('should handle error when updating preset fails', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const { result } = renderHook(() => usePresetStore());

      await act(async () => {
        try {
          await result.current.updatePreset('non-existent', { name: 'Test' });
        } catch (error) {
          // L'erreur est lancée, ce qui est le comportement attendu
        }
      });

      expect(result.current.error).toContain('Failed to update preset');
    });
  });

  describe('deletePreset', () => {
    it('should delete preset successfully', async () => {
      const preset = {
        id: '1',
        name: 'Test Preset',
        icon: '🎭',
        metadata: { created: '2026-01-17T10:00:00Z', modified: '2026-01-17T10:00:00Z' },
        configuration: {
          characters: [],
          locations: [],
          region: 'Test',
          sceneType: 'Test',
          instructions: '',
        },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
      });

      const { result } = renderHook(() => usePresetStore());

      // Setup initial state
      act(() => {
        result.current.presets = [preset];
      });

      await act(async () => {
        await result.current.deletePreset('1');
      });

      expect(result.current.presets).toEqual([]);
      expect(result.current.error).toBeNull();
    });

    it('should clear selectedPreset if deleted preset was selected', async () => {
      const preset = {
        id: '1',
        name: 'Test Preset',
        icon: '🎭',
        metadata: { created: '2026-01-17T10:00:00Z', modified: '2026-01-17T10:00:00Z' },
        configuration: {
          characters: [],
          locations: [],
          region: 'Test',
          sceneType: 'Test',
          instructions: '',
        },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
      });

      const { result } = renderHook(() => usePresetStore());

      // Setup initial state
      act(() => {
        result.current.presets = [preset];
        result.current.selectedPreset = preset;
      });

      await act(async () => {
        await result.current.deletePreset('1');
      });

      expect(result.current.selectedPreset).toBeNull();
    });

    it('should handle error when deleting preset fails', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const { result } = renderHook(() => usePresetStore());

      await act(async () => {
        await result.current.deletePreset('non-existent');
      });

      expect(result.current.error).toContain('Failed to delete preset');
    });
  });

  describe('loadPreset', () => {
    it('should load preset successfully', async () => {
      const preset = {
        id: '1',
        name: 'Test Preset',
        icon: '🎭',
        metadata: { created: '2026-01-17T10:00:00Z', modified: '2026-01-17T10:00:00Z' },
        configuration: {
          characters: ['char-001'],
          locations: ['loc-001'],
          region: 'Test Region',
          sceneType: 'Test',
          instructions: 'Test instructions',
        },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => preset,
      });

      const { result } = renderHook(() => usePresetStore());

      await act(async () => {
        await result.current.loadPreset('1');
      });

      expect(result.current.selectedPreset).toEqual(preset);
      expect(result.current.error).toBeNull();
    });

    it('should handle error when loading preset fails', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const { result } = renderHook(() => usePresetStore());

      await act(async () => {
        await result.current.loadPreset('non-existent');
      });

      expect(result.current.error).toContain('Failed to load preset');
      expect(result.current.selectedPreset).toBeNull();
    });
  });

  describe('validatePreset', () => {
    it('should validate preset successfully with no warnings', async () => {
      const validationResult = {
        valid: true,
        warnings: [],
        obsoleteRefs: [],
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => validationResult,
      });

      const { result } = renderHook(() => usePresetStore());

      let validationResponse;
      await act(async () => {
        validationResponse = await result.current.validatePreset('1');
      });

      expect(validationResponse).toEqual(validationResult);
      expect(result.current.error).toBeNull();
    });

    it('should validate preset and return warnings for obsolete refs', async () => {
      const validationResult = {
        valid: false,
        warnings: ["Character 'char-999' not found"],
        obsoleteRefs: ['char-999'],
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => validationResult,
      });

      const { result } = renderHook(() => usePresetStore());

      let validationResponse;
      await act(async () => {
        validationResponse = await result.current.validatePreset('1');
      });

      expect(validationResponse).toEqual(validationResult);
    });

    it('should handle error when validating preset fails', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const { result } = renderHook(() => usePresetStore());

      await act(async () => {
        try {
          await result.current.validatePreset('non-existent');
        } catch (error: unknown) {
          expect(error).toBeInstanceOf(Error)
          expect((error as Error).message).toContain('Failed to validate preset')
        }
      });
    });
  });

  describe('setSelectedPreset', () => {
    it('should set selected preset', () => {
      const { result } = renderHook(() => usePresetStore());

      const preset = {
        id: '1',
        name: 'Test Preset',
        icon: '🎭',
        metadata: { created: '2026-01-17T10:00:00Z', modified: '2026-01-17T10:00:00Z' },
        configuration: {
          characters: [],
          locations: [],
          region: 'Test',
          sceneType: 'Test',
          instructions: '',
        },
      };

      act(() => {
        result.current.setSelectedPreset(preset);
      });

      expect(result.current.selectedPreset).toEqual(preset);
    });

    it('should clear selected preset when set to null', () => {
      const { result } = renderHook(() => usePresetStore());

      const preset = {
        id: '1',
        name: 'Test',
        icon: '🎭',
        metadata: { created: '2026-01-17T10:00:00Z', modified: '2026-01-17T10:00:00Z' },
        configuration: {
          characters: [],
          locations: [],
          region: 'Test',
          sceneType: 'Test',
          instructions: '',
        },
      };

      act(() => {
        result.current.setSelectedPreset(preset);
        result.current.setSelectedPreset(null);
      });

      expect(result.current.selectedPreset).toBeNull();
    });
  });

  describe('reset', () => {
    it('should reset store to initial state', () => {
      const { result } = renderHook(() => usePresetStore());

      const preset = {
        id: '1',
        name: 'Test',
        icon: '🎭',
        metadata: { created: '2026-01-17T10:00:00Z', modified: '2026-01-17T10:00:00Z' },
        configuration: {
          characters: [],
          locations: [],
          region: 'Test',
          sceneType: 'Test',
          instructions: '',
        },
      };

      act(() => {
        result.current.presets = [preset];
        result.current.selectedPreset = preset;
        result.current.error = 'Some error';
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.presets).toEqual([]);
      expect(result.current.selectedPreset).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });
});
