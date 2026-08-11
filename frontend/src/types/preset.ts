/**
 * Types TypeScript pour les presets de génération
 */

import type { ContextSelection, ReasoningEffort } from './api'

export interface PresetMetadata {
  created: string; // ISO 8601
  modified: string; // ISO 8601
}

export interface PresetConfiguration {
  characters: string[]; // Noms (source-of-truth côté UI)
  locations: string[]; // Noms (inclut région/sous-lieux si souhaité)
  region: string;
  subLocation?: string;
  sceneType: string; // ex: "Première rencontre", "Confrontation"
  instructions: string; // Brief scène
  fieldConfigs?: Record<string, string[]>; // Optionnel (sélection champs contexte)
  /** Snapshot complet des sélections de contexte (toutes catégories) */
  contextSelections?: ContextSelection;
  /** Région sélectionnée dans le ContextSelector (source-of-truth pour région/sous-lieux) */
  selectedRegion?: string | null;
  /** Sous-lieux sélectionnés dans le ContextSelector */
  selectedSubLocations?: string[];
  /** Top_p (nucleus sampling) - optionnel */
  topP?: number | null;
  /** Reasoning effort - optionnel */
  reasoningEffort?: ReasoningEffort | null;
  /** Max completion tokens - optionnel */
  maxCompletionTokens?: number | null;
  /** Max choices - optionnel */
  maxChoices?: number | null;
  /** LLM model identifier - optionnel */
  llmModel?: string;
}

export interface Preset {
  id: string; // UUID
  name: string;
  icon: string; // emoji
  metadata: PresetMetadata;
  configuration: PresetConfiguration;
}

export interface PresetCreate {
  name: string;
  icon?: string;
  configuration: PresetConfiguration;
}

export interface PresetUpdate {
  name?: string;
  icon?: string;
  configuration?: PresetConfiguration;
}

export interface PresetValidationResult {
  valid: boolean;
  warnings: string[];
  obsoleteRefs: string[];
  /** Ancien libellé → nom canonique GDD (alias ou fuzzy). */
  resolvedRefs?: Record<string, string>;
}
