/**
 * Store Zustand pour la gestion des presets de génération
 */
import { AxiosError } from 'axios';
import { create } from 'zustand';
import type { Preset, PresetCreate, PresetUpdate, PresetValidationResult } from '../types/preset';
import {
  listPresetsApi,
  getPresetApi,
  createPresetApi,
  updatePresetApi,
  deletePresetApi,
  validatePresetApi,
} from '../api/presets';

function formatPresetRequestError(actionLabel: string, error: unknown): string {
  if (error instanceof AxiosError && error.response?.status != null) {
    return `Failed to ${actionLabel}: ${error.response.status}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return `Failed to ${actionLabel}`;
}

/** Retour de création : message serveur d’auto-nettoyage éventuel (toast). */
export interface PresetCreateOutcome {
  cleanupMessage: string | null;
}

interface PresetStore {
  // État
  presets: Preset[];
  selectedPreset: Preset | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadPresets: () => Promise<void>;
  createPreset: (presetData: PresetCreate) => Promise<PresetCreateOutcome>;
  updatePreset: (id: string, updateData: PresetUpdate) => Promise<void>;
  deletePreset: (id: string) => Promise<void>;
  loadPreset: (id: string) => Promise<void>;
  validatePreset: (id: string) => Promise<PresetValidationResult>;
  setSelectedPreset: (preset: Preset | null) => void;
  reset: () => void;
}

export const usePresetStore = create<PresetStore>((set) => ({
  // État initial
  presets: [],
  selectedPreset: null,
  isLoading: false,
  error: null,

  // Actions
  loadPresets: async () => {
    set({ isLoading: true, error: null });
    try {
      const presets = await listPresetsApi();
      set({ presets, isLoading: false });
    } catch (error) {
      set({
        error: formatPresetRequestError('load presets', error),
        isLoading: false,
      });
    }
  },

  createPreset: async (presetData: PresetCreate) => {
    set({ isLoading: true, error: null });
    try {
      const { preset: newPreset, cleanupMessage } = await createPresetApi(presetData);
      set((state) => ({
        presets: [...state.presets, newPreset],
        isLoading: false,
      }));

      return { cleanupMessage };
    } catch (error) {
      set({
        error: formatPresetRequestError('create preset', error),
        isLoading: false,
      });
      throw error;
    }
  },

  updatePreset: async (id: string, updateData: PresetUpdate) => {
    set({ isLoading: true, error: null });
    try {
      const updatedPreset = await updatePresetApi(id, updateData);
      set((state) => ({
        presets: state.presets.map((p) => (p.id === id ? updatedPreset : p)),
        selectedPreset:
          state.selectedPreset?.id === id ? updatedPreset : state.selectedPreset,
        isLoading: false,
      }));
    } catch (error) {
      set({
        error: formatPresetRequestError('update preset', error),
        isLoading: false,
      });
      throw error;
    }
  },

  deletePreset: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await deletePresetApi(id);
      set((state) => ({
        presets: state.presets.filter((p) => p.id !== id),
        selectedPreset:
          state.selectedPreset?.id === id ? null : state.selectedPreset,
        isLoading: false,
      }));
    } catch (error) {
      set({
        error: formatPresetRequestError('delete preset', error),
        isLoading: false,
      });
    }
  },

  loadPreset: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const preset = await getPresetApi(id);
      set({ selectedPreset: preset, isLoading: false });
    } catch (error) {
      set({
        error: formatPresetRequestError('load preset', error),
        isLoading: false,
        selectedPreset: null,
      });
    }
  },

  validatePreset: async (id: string): Promise<PresetValidationResult> => {
    try {
      return await validatePresetApi(id);
    } catch (error) {
      throw new Error(formatPresetRequestError('validate preset', error));
    }
  },

  setSelectedPreset: (preset: Preset | null) => {
    set({ selectedPreset: preset });
  },

  reset: () => {
    set({
      presets: [],
      selectedPreset: null,
      isLoading: false,
      error: null,
    });
  },
}));
