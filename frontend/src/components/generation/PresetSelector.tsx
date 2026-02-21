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
import type { Preset, PresetConfiguration } from '../../types/preset';
import { theme } from '../../theme';
import { useToast, SaveStatusIndicator } from '../shared';
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
  const {
    presets,
    isLoading,
    error,
    loadPresets,
    createPreset,
    deletePreset,
    setSelectedPreset,
  } = usePresetStore();
  const toast = useToast();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [presetToDelete, setPresetToDelete] = useState<Preset | null>(null);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetIcon, setNewPresetIcon] = useState('📋');
  const [snapshotConfiguration, setSnapshotConfiguration] = useState<PresetConfiguration | null>(null);

  // Charger presets au montage
  useEffect(() => {
    loadPresets();
  }, [loadPresets]);

  const handlePresetSelect = (preset: Preset) => {
    setSelectedPreset(preset);
    onPresetLoaded(preset);
    setIsDropdownOpen(false);
  };

  const handleCreatePreset = async () => {
    const configToSave = snapshotConfiguration || currentConfiguration || getCurrentConfiguration?.() || null;
    if (!newPresetName.trim() || !configToSave) return;

    try {
      const response = await createPreset({
        name: newPresetName.trim(),
        icon: newPresetIcon,
        configuration: configToSave,
      });

      // Vérifier message auto-cleanup dans header
      const cleanupMessage = response.headers.get('X-Preset-Cleanup-Message');
      if (cleanupMessage) {
        toast(cleanupMessage, 'warning');
      } else {
        toast('Preset créé avec succès', 'success');
      }

      setIsCreateModalOpen(false);
      setNewPresetName('');
      setNewPresetIcon('📋');
      setSnapshotConfiguration(null);
    } catch (error) {
      // Error already handled by store
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

      {/* Barre compacte : Charger + Sauvegarder */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        {/* Dropdown "Charger preset" */}
        <div style={{ position: 'relative', flex: 1 }}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            style={{
              width: '100%',
              padding: '0.5rem 1rem',
              backgroundColor: theme.background.secondary,
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '4px',
              color: theme.text.primary,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>📋 Charger preset</span>
            <span>{isDropdownOpen ? '▲' : '▼'}</span>
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

        {/* Bouton "Sauvegarder preset" */}
        <button
          onClick={() => {
            const cfg = currentConfiguration || getCurrentConfiguration?.() || null;
            setSnapshotConfiguration(cfg);
            setIsCreateModalOpen(true);
          }}
          disabled={!currentConfiguration && !getCurrentConfiguration}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: theme.button.primary.background,
            border: 'none',
            borderRadius: '4px',
            color: 'white',
            cursor: currentConfiguration || getCurrentConfiguration ? 'pointer' : 'not-allowed',
            opacity: currentConfiguration || getCurrentConfiguration ? 1 : 0.5,
            whiteSpace: 'nowrap',
          }}
        >
          💾 Sauvegarder
        </button>

        {/* Indicateur de statut de sauvegarde */}
        {saveStatus && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <SaveStatusIndicator status={saveStatus} />
          </div>
        )}
      </div>

      {/* Modal création preset */}
      {isCreateModalOpen && (
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
          onClick={() => setIsCreateModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: theme.background.panel,
              padding: '2rem',
              borderRadius: '8px',
              minWidth: '400px',
              maxWidth: '500px',
              border: `1px solid ${theme.border.primary}`,
            }}
          >
            <h3 style={{ marginTop: 0, color: theme.text.primary }}>Nouveau preset</h3>

            <div style={{ marginBottom: '1rem' }}>
              <label
                htmlFor="preset-name"
                style={{ display: 'block', marginBottom: '0.5rem', color: theme.text.secondary }}
              >
                Nom
              </label>
              <input
                id="preset-name"
                type="text"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="Ex: Confrontation Akthar-Neth"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  backgroundColor: theme.background.secondary,
                  border: `1px solid ${theme.border.primary}`,
                  borderRadius: '4px',
                  color: theme.text.primary,
                }}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label
                htmlFor="preset-icon"
                style={{ display: 'block', marginBottom: '0.5rem', color: theme.text.secondary }}
              >
                Icône (emoji)
              </label>
              <input
                id="preset-icon"
                type="text"
                value={newPresetIcon}
                onChange={(e) => setNewPresetIcon(e.target.value)}
                maxLength={2}
                style={{
                  width: '60px',
                  padding: '0.5rem',
                  backgroundColor: theme.background.secondary,
                  border: `1px solid ${theme.border.primary}`,
                  borderRadius: '4px',
                  color: theme.text.primary,
                  textAlign: 'center',
                  fontSize: '1.5rem',
                }}
              />
            </div>

            {/* Aperçu configuration */}
            {snapshotConfiguration && (
              <div
                style={{
                  padding: '1rem',
                  backgroundColor: theme.background.secondary,
                  borderRadius: '4px',
                  marginBottom: '1rem',
                }}
              >
                <div style={{ fontSize: '0.875rem', color: theme.text.secondary, marginBottom: '0.5rem' }}>
                  Aperçu configuration :
                </div>
                <div style={{ fontSize: '0.875rem', color: theme.text.primary }}>
                  <div>Personnages : {snapshotConfiguration.characters.length}</div>
                  <div>Lieux : {snapshotConfiguration.locations.length}</div>
                  <div>Région : {snapshotConfiguration.region}</div>
                  {snapshotConfiguration.subLocation && <div>Sous-lieu : {snapshotConfiguration.subLocation}</div>}
                  <div>Scène : {snapshotConfiguration.sceneType}</div>
                  {snapshotConfiguration.contextSelections && (
                    <>
                      <div>
                        Objets : {new Set([...(snapshotConfiguration.contextSelections.items_full || []), ...(snapshotConfiguration.contextSelections.items_excerpt || [])]).size}
                      </div>
                      <div>
                        Espèces : {new Set([...(snapshotConfiguration.contextSelections.species_full || []), ...(snapshotConfiguration.contextSelections.species_excerpt || [])]).size}
                      </div>
                      <div>
                        Communautés : {new Set([...(snapshotConfiguration.contextSelections.communities_full || []), ...(snapshotConfiguration.contextSelections.communities_excerpt || [])]).size}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                disabled={isLoading}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: theme.background.secondary,
                  border: `1px solid ${theme.border.primary}`,
                  borderRadius: '4px',
                  color: theme.text.primary,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.6 : 1,
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleCreatePreset}
                disabled={!newPresetName.trim() || isLoading}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: theme.button.primary.background,
                  border: 'none',
                  borderRadius: '4px',
                  color: 'white',
                  cursor: !newPresetName.trim() || isLoading ? 'not-allowed' : 'pointer',
                  opacity: !newPresetName.trim() || isLoading ? 0.6 : 1,
                }}
              >
                {isLoading ? 'Sauvegarde…' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}

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
