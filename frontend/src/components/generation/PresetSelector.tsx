/**
 * PresetSelector - Composant de sélection et gestion des presets
 * 
 * Permet de :
 * - Charger un preset existant (dropdown)
 * - Sauvegarder la configuration actuelle comme preset
 * - Supprimer un preset (menu contextuel)
 */
import React, { useEffect, useState } from 'react';
import { usePresetStore } from '../../store/presetStore';
import { useTemplateStore } from '../../store/templateStore';
import { useLLMStore } from '../../store/llmStore';
import type { Preset, PresetConfiguration } from '../../types/preset';
import type { Template, TemplateConfiguration } from '../../types/template';
import { theme } from '../../theme';
import { redesignControl, redesignDisclosureArrow, redesignRadius } from '../../theme/redesignTokens';
import { generationPanelChrome } from '../../theme/responsiveChrome';
import { useToast, SaveStatusIndicator } from '../shared';
import { useGenerationPanelNarrow } from './GenerationPanelNarrowContext';
import { TemplateCreatorModal } from './TemplateCreatorModal';
import { groupTemplatesByCategory } from '../../utils/templateGroups';
import type { SaveStatus } from '../shared/SaveStatusIndicator';

export interface PresetSelectorProps {
  /** Callback appelé quand un preset est chargé */
  onPresetLoaded: (preset: Preset) => void;
  /** Configuration actuelle pour sauvegarde */
  currentConfiguration?: PresetConfiguration;
  /** Getter lazy pour éviter recalculs coûteux à chaque render */
  getCurrentConfiguration?: () => PresetConfiguration;
  /** Statut de sauvegarde */
  saveStatus?: SaveStatus;
}

export const PresetSelector: React.FC<PresetSelectorProps> = ({
  onPresetLoaded,
  currentConfiguration,
  getCurrentConfiguration,
  saveStatus,
}) => {
  const isNarrow = useGenerationPanelNarrow();
  const chrome = isNarrow ? generationPanelChrome.narrow : generationPanelChrome.comfortable;
  const {
    presets,
    selectedPreset,
    isLoading,
    error,
    loadPresets,
    updatePreset,
    deletePreset,
    setSelectedPreset,
  } = usePresetStore();
  const { templates, loadTemplates, error: templateError } = useTemplateStore();
  const toast = useToast();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [presetToDelete, setPresetToDelete] = useState<Preset | null>(null);
  const [snapshotConfiguration, setSnapshotConfiguration] = useState<TemplateConfiguration | null>(null);
  const [isUpdatingPreset, setIsUpdatingPreset] = useState(false);

  useEffect(() => {
    loadPresets();
    void loadTemplates();
  }, [loadPresets, loadTemplates]);

  const handlePresetSelect = (preset: Preset) => {
    setSelectedPreset(preset);
    onPresetLoaded(preset);
    setIsDropdownOpen(false);
  };

  const captureTemplateSnapshot = (): TemplateConfiguration | null => {
    const cfg = currentConfiguration || getCurrentConfiguration?.() || null;
    if (!cfg) {
      return null;
    }
    const llmState = useLLMStore.getState();
    const snapshot: TemplateConfiguration = {
      ...cfg,
      llmProvider: llmState.provider,
    };
    delete snapshot.temperature;
    return snapshot;
  };

  const handleUpdatePreset = async () => {
    const configToSave = currentConfiguration || getCurrentConfiguration?.() || null;
    if (!selectedPreset || !configToSave) return;

    setIsUpdatingPreset(true);
    try {
      await updatePreset(selectedPreset.id, {
        configuration: configToSave,
      });
      toast('Preset enregistré avec succès', 'success');
    } catch (error) {
      // Error already handled by store
    } finally {
      setIsUpdatingPreset(false);
    }
  };

  const handleDeletePreset = async () => {
    if (!presetToDelete) return;

    await deletePreset(presetToDelete.id);
    setIsDeleteConfirmOpen(false);
    setPresetToDelete(null);
  };

  const openDeleteConfirm = (preset: Preset, e: React.MouseEvent) => {
    e.stopPropagation();
    setPresetToDelete(preset);
    setIsDeleteConfirmOpen(true);
  };

  return (
    <div style={{ marginBottom: '1rem' }}>
      {/* Error display */}
      {error && (
        <div style={{ color: theme.state.error.color, marginBottom: '0.5rem', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}
      {templateError && (
        <div
          data-testid="mes-templates-error"
          style={{ color: theme.state.error.color, marginBottom: '0.5rem', fontSize: '0.875rem' }}
        >
          {templateError}
        </div>
      )}

      {/* Barre compacte : Charger + Sauvegarder */}
      <div
        style={{
          display: 'flex',
          flexWrap: isNarrow ? 'wrap' : 'nowrap',
          gap: `${chrome.controlGapRem}rem`,
          alignItems: 'center',
        }}
      >
        {/* Dropdown "Charger preset" */}
        <div
          style={{
            position: 'relative',
            flex: isNarrow ? '1 1 100%' : '1',
            minWidth: 0,
          }}
        >
          <button
            type="button"
            data-testid="preset-dropdown-trigger"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            style={{
              width: '100%',
              padding: chrome.buttonPadding,
              backgroundColor: theme.background.secondary,
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '4px',
              color: theme.text.primary,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: `${chrome.buttonFontRem}rem`,
              boxSizing: 'border-box',
            }}
          >
            <span>Charger preset</span>
            <span
              aria-hidden
              style={{ fontSize: redesignDisclosureArrow.solid, lineHeight: 1 }}
            >
              {isDropdownOpen ? '▲' : '▼'}
            </span>
          </button>

          {/* Dropdown menu */}
          {isDropdownOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 0.25rem)',
                left: 0,
                right: 0,
                backgroundColor: theme.background.panel,
                border: `1px solid ${theme.border.primary}`,
                borderRadius: '4px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                zIndex: 1000,
                maxHeight: '300px',
                overflowY: 'auto',
              }}
            >
              {isLoading && (
                <div style={{ padding: '1rem', textAlign: 'center', color: theme.text.secondary }}>
                  Chargement...
                </div>
              )}

              {!isLoading && presets.length === 0 && (
                <div style={{ padding: '1rem', textAlign: 'center', color: theme.text.secondary }}>
                  Aucun preset sauvegardé
                </div>
              )}

              {!isLoading &&
                presets.map((preset) => (
                  <div
                    key={preset.id}
                    data-testid="preset-item"
                    data-preset-name={preset.name}
                    style={{
                      padding: '0.75rem 1rem',
                      cursor: 'pointer',
                      borderBottom: `1px solid ${theme.border.secondary}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = theme.background.secondary;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <div
                      onClick={() => handlePresetSelect(preset)}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                      <span style={{ fontSize: '1.25rem' }}>{preset.icon}</span>
                      <div>
                        <div style={{ fontWeight: 'bold', color: theme.text.primary }}>
                          {preset.name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: theme.text.secondary }}>
                          {preset.configuration.characters.length} perso(s),{' '}
                          {preset.configuration.locations.length} lieu(x)
                        </div>
                      </div>
                    </div>

                    {/* Menu contextuel : Supprimer */}
                    <button
                      onClick={(e) => openDeleteConfirm(preset, e)}
                      style={{
                        padding: '0.25rem 0.5rem',
                        backgroundColor: 'transparent',
                      border: 'none',
                      color: theme.state.error.color,
                      cursor: 'pointer',
                        fontSize: '0.875rem',
                      }}
                      title="Supprimer"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Bouton "Enregistrer" */}
        <button
          type="button"
          data-testid="preset-save-btn"
          onClick={handleUpdatePreset}
          disabled={!selectedPreset || (!currentConfiguration && !getCurrentConfiguration) || isUpdatingPreset}
          title={selectedPreset ? `Enregistrer "${selectedPreset.name}"` : 'Chargez un preset pour l’enregistrer'}
          style={{
            padding: '0.5rem 1rem',
            // Un seul bouton plein bleu par écran : l'action primaire est « Générer ».
            backgroundColor: 'transparent',
            border: `1px solid ${redesignControl.border}`,
            borderRadius: `${redesignRadius.control}px`,
            color: theme.text.secondary,
            fontWeight: 500,
            cursor: selectedPreset && (currentConfiguration || getCurrentConfiguration) && !isUpdatingPreset ? 'pointer' : 'not-allowed',
            opacity: selectedPreset && (currentConfiguration || getCurrentConfiguration) && !isUpdatingPreset ? 1 : 0.5,
            whiteSpace: 'nowrap',
          }}
        >
          {isUpdatingPreset ? 'Enregistrement…' : 'Enregistrer'}
        </button>

        {/* Bouton « Sauvegarder comme template » */}
        <button
          type="button"
          data-testid="template-save-as-btn"
          onClick={() => {
            setSnapshotConfiguration(captureTemplateSnapshot());
            setIsCreateModalOpen(true);
          }}
          disabled={!currentConfiguration && !getCurrentConfiguration}
          style={{
            padding: chrome.buttonPadding,
            backgroundColor: theme.button.default.background,
            border: `1px solid ${theme.border.secondary}`,
            borderRadius: `${redesignRadius.control}px`,
            color: theme.button.default.color,
            fontWeight: 600,
            cursor: currentConfiguration || getCurrentConfiguration ? 'pointer' : 'not-allowed',
            opacity: currentConfiguration || getCurrentConfiguration ? 1 : 0.5,
            whiteSpace: 'nowrap',
            fontSize: `${chrome.buttonFontRem}rem`,
            flex: isNarrow ? '1 1 auto' : undefined,
          }}
        >
          Sauvegarder comme template
        </button>

        {/* Indicateur de statut de sauvegarde */}
        {saveStatus && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <SaveStatusIndicator status={saveStatus} />
          </div>
        )}
      </div>

      <TemplateCreatorModal
        isOpen={isCreateModalOpen}
        snapshot={snapshotConfiguration}
        onClose={() => {
          setIsCreateModalOpen(false);
          setSnapshotConfiguration(null);
        }}
      />

      <section
        data-testid="mes-templates-list"
        style={{
          marginTop: `${chrome.controlGapRem}rem`,
        }}
      >
        <h3
          style={{
            margin: `0 0 ${chrome.controlGapRem}rem`,
            color: theme.text.primary,
            fontSize: `${chrome.sectionTitleFontRem}rem`,
            fontWeight: 600,
          }}
        >
          Mes templates
        </h3>
        {templateError && templates.length === 0 ? null : templates.length === 0 ? (
          <div
            data-testid="mes-templates-empty"
            style={{
              fontSize: `${chrome.labelFontRem}rem`,
              color: theme.text.secondary,
            }}
          >
            Aucun template sauvegardé
          </div>
        ) : (
          groupTemplatesByCategory(templates).map(([category, items]) => (
            <div
              key={category}
              data-testid="template-category-group"
              data-category={category}
              style={{ marginBottom: `${chrome.controlGapRem}rem` }}
            >
              <div
                style={{
                  fontSize: `${chrome.labelFontRem}rem`,
                  color: theme.text.secondary,
                  marginBottom: '0.35rem',
                  fontWeight: 600,
                }}
              >
                {category}
              </div>
              {items.map((template: Template) => (
                <div
                  key={template.id}
                  data-testid="template-item"
                  data-template-name={template.name}
                  data-template-category={template.category}
                  style={{
                    padding: chrome.dropdownOptionPadding,
                    border: `1px solid ${theme.border.secondary}`,
                    borderRadius: `${redesignRadius.control}px`,
                    marginBottom: '0.35rem',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.5rem',
                  }}
                >
                  <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>{template.icon}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, color: theme.text.primary }}>
                      {template.name}
                    </div>
                    {template.description && (
                      <div
                        style={{
                          fontSize: `${chrome.labelFontRem}rem`,
                          color: theme.text.secondary,
                        }}
                      >
                        {template.description}
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: `${chrome.labelFontRem}rem`,
                        color: theme.text.secondary,
                      }}
                    >
                      {template.configuration.characters.length > 0
                        ? `Contexte : ${template.configuration.characters.join(', ')}`
                        : 'Contexte : —'}
                      {template.configuration.locations.length > 0
                        ? ` · ${template.configuration.locations.join(', ')}`
                        : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </section>

      {/* Modal confirmation suppression */}
      {isDeleteConfirmOpen && presetToDelete && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
          onClick={() => setIsDeleteConfirmOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: theme.background.panel,
              padding: '2rem',
              borderRadius: '8px',
              minWidth: '350px',
              border: `1px solid ${theme.border.primary}`,
            }}
          >
            <h3 style={{ marginTop: 0, color: theme.text.primary }}>Supprimer preset</h3>
            <p style={{ color: theme.text.secondary }}>
              Êtes-vous sûr de vouloir supprimer le preset "{presetToDelete.name}" ?
            </p>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setIsDeleteConfirmOpen(false)}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: theme.background.secondary,
                  border: `1px solid ${theme.border.primary}`,
                  borderRadius: '4px',
                  color: theme.text.primary,
                  cursor: 'pointer',
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleDeletePreset}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: theme.state.error.color,
                  border: 'none',
                  borderRadius: '4px',
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
