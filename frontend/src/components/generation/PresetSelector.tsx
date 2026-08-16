/**
 * PresetSelector - Composant de sélection et gestion des presets
 * 
 * Permet de :
 * - Charger un preset existant (dropdown)
 * - Sauvegarder la configuration actuelle comme preset
 * - Supprimer un preset (menu contextuel)
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePresetStore } from '../../store/presetStore';
import { useTemplateStore } from '../../store/templateStore';
import { useLLMStore } from '../../store/llmStore';
import { useAuthStore } from '../../store/authStore';
import type { Preset, PresetConfiguration } from '../../types/preset';
import type { Template, TemplateConfiguration, PrebuiltTemplate, TemplateSuggestion, TemplateSuggestionRequest } from '../../types/template';
import { theme } from '../../theme';
import { redesignControl, redesignDisclosureArrow, redesignRadius } from '../../theme/redesignTokens';
import { generationPanelChrome } from '../../theme/responsiveChrome';
import { TOUCH_TARGET_MIN_PX } from '../../constants';
import { useToast, SaveStatusIndicator, ConfirmDialog } from '../shared';
import { useGenerationPanelNarrow } from './GenerationPanelNarrowContext';
import { TemplateCreatorModal } from './TemplateCreatorModal';
import { TemplateEditorModal } from './TemplateEditorModal';
import { PrebuiltTemplateModal } from './PrebuiltTemplateModal';
import { TemplateMarketplaceModal } from './TemplateMarketplaceModal';
import { TemplateSuggestionsModal } from './TemplateSuggestionsModal';
import { TemplateABTestingModal } from './TemplateABTestingModal';
import { TemplateSharingModal } from './TemplateSharingModal';
import { NarrowOverlayDrawer } from '../layout/NarrowOverlayDrawer';
import { filterTemplates, groupTemplatesByCategory, TEMPLATE_UNCATEGORIZED_LABEL } from '../../utils/templateGroups';
import { isPrebuiltNew } from '../../utils/templateApply';
import { copyTemplateApi, publishMarketplaceTemplateApi } from '../../api/templates';
import { useContextStore } from '../../store/contextStore';
import { useGenerationStore } from '../../store/generationStore';
import { rencontreInitialeBySelectedCharacters } from '../../utils/templateSuggestionScore';
import type { SaveStatus } from '../shared/SaveStatusIndicator';

function formatTemplateDate(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }
  return date.toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function templateLatestAt(template: Template): string | undefined {
  const last = template.history?.at(-1)?.at;
  return last ?? template.metadata.modified ?? template.metadata.created;
}

function formatActiveTemplateFilters(
  nameFilter: string,
  categoryFilter: string,
  contextFilter: string,
): string {
  const parts: string[] = [];
  if (nameFilter.trim()) {
    parts.push(`nom « ${nameFilter.trim()} »`);
  }
  if (categoryFilter.trim()) {
    parts.push(`catégorie « ${categoryFilter.trim()} »`);
  }
  if (contextFilter.trim()) {
    parts.push(`contexte « ${contextFilter.trim()} »`);
  }
  return `Filtres : ${parts.join(' · ')}`;
}

function isSharedTemplate(template: Template): boolean {
  return template.visibility === 'shared';
}

function canShareTemplate(template: Template): boolean {
  return template.visibility === 'owned';
}

function buildSuggestionRequest(
  getCurrentConfiguration?: () => PresetConfiguration,
  currentConfiguration?: PresetConfiguration,
): TemplateSuggestionRequest {
  const generation = useGenerationStore.getState();
  const context = useContextStore.getState();
  const config = getCurrentConfiguration?.() ?? currentConfiguration;
  const uniq = <T,>(arr: T[]) => Array.from(new Set(arr));
  const characters = uniq([
    ...(Array.isArray(context.selections.characters_full) ? context.selections.characters_full : []),
    ...(Array.isArray(context.selections.characters_excerpt)
      ? context.selections.characters_excerpt
      : []),
  ]);
  const locations = uniq([
    ...(Array.isArray(context.selections.locations_full) ? context.selections.locations_full : []),
    ...(Array.isArray(context.selections.locations_excerpt)
      ? context.selections.locations_excerpt
      : []),
    ...(context.selectedRegion ? [context.selectedRegion] : []),
    ...(Array.isArray(context.selectedSubLocations) ? context.selectedSubLocations : []),
  ]);
  return {
    instructions: generation.generationUserInstructions || config?.instructions || '',
    sceneType:
      !config?.sceneType || config.sceneType.trim().toLowerCase() === 'generic'
        ? ''
        : config.sceneType,
    characters,
    locations,
    rencontreInitialeByCharacter: rencontreInitialeBySelectedCharacters(
      characters,
      context.characters,
    ),
  };
}

export interface PresetSelectorProps {
  /** Callback appelé quand un preset est chargé */
  onPresetLoaded: (preset: Preset) => void;
  /** Callback appelé quand un template custom est appliqué (clic carte) */
  onTemplateLoaded?: (template: Template) => void;
  /** Callback appelé quand une fiche pré-built est chargée (bouton Charger) */
  onPrebuiltLoaded?: (prebuilt: PrebuiltTemplate) => void;
  /** Callback appelé depuis le modal Suggestions */
  onSuggestionLoaded?: (item: TemplateSuggestion) => void | Promise<void>;
  /** Configuration actuelle pour sauvegarde */
  currentConfiguration?: PresetConfiguration;
  /** Getter lazy pour éviter recalculs coûteux à chaque render */
  getCurrentConfiguration?: () => PresetConfiguration;
  /** Statut de sauvegarde */
  saveStatus?: SaveStatus;
}

export const PresetSelector: React.FC<PresetSelectorProps> = ({
  onPresetLoaded,
  onTemplateLoaded,
  onPrebuiltLoaded,
  onSuggestionLoaded,
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
  const {
    templates,
    prebuiltTemplates,
    loadTemplates,
    loadPrebuiltTemplates,
    error: templateError,
    prebuiltError,
    prebuiltLoading,
    createTemplate,
    deleteTemplate,
  } = useTemplateStore();
  const toast = useToast();
  const currentUser = useAuthStore((state) => state.user);
  const isGuest = currentUser?.role === 'guest';

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [presetToDelete, setPresetToDelete] = useState<Preset | null>(null);
  const [snapshotConfiguration, setSnapshotConfiguration] = useState<TemplateConfiguration | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<Template | null>(null);
  const [viewingPrebuilt, setViewingPrebuilt] = useState<PrebuiltTemplate | null>(null);
  const [isUpdatingPreset, setIsUpdatingPreset] = useState(false);
  const [nameFilter, setNameFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [contextFilter, setContextFilter] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const deletingTemplateRef = useRef(false);
  const copyingPrebuiltRef = useRef(false);
  const [isCopyingPrebuilt, setIsCopyingPrebuilt] = useState(false);
  const [isMarketplaceOpen, setIsMarketplaceOpen] = useState(false);
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const [suggestionRequest, setSuggestionRequest] = useState<TemplateSuggestionRequest>({
    instructions: '',
    sceneType: '',
    characters: [],
    locations: [],
    rencontreInitialeByCharacter: {},
  });
  const [isAbTestOpen, setIsAbTestOpen] = useState(false);
  const [sharingTemplate, setSharingTemplate] = useState<Template | null>(null);
  const publishingRef = useRef(false);
  const copyingSharedRef = useRef(false);
  const [isCopyingShared, setIsCopyingShared] = useState(false);
  const sharedModifiedRef = useRef<Map<string, string>>(new Map());
  const sharedToastReadyRef = useRef(false);

  const ownedTemplates = useMemo(
    () => templates.filter((template) => !isSharedTemplate(template)),
    [templates],
  );
  const sharedTemplates = useMemo(
    () => templates.filter((template) => isSharedTemplate(template)),
    [templates],
  );

  const filteredTemplates = useMemo(
    () =>
      filterTemplates(ownedTemplates, {
        name: nameFilter,
        category: categoryFilter,
        context: contextFilter,
      }),
    [ownedTemplates, nameFilter, categoryFilter, contextFilter],
  );
  const groupedTemplates = useMemo(
    () => groupTemplatesByCategory(filteredTemplates),
    [filteredTemplates],
  );
  const categoryOptions = useMemo(() => {
    const keys = new Set(
      templates.map((template) => template.category?.trim() || TEMPLATE_UNCATEGORIZED_LABEL),
    );
    return Array.from(keys);
  }, [templates]);

  const hasActiveFilters = Boolean(
    nameFilter.trim() || categoryFilter.trim() || contextFilter.trim(),
  );

  const filterInputStyle: React.CSSProperties = {
    width: '100%',
    minHeight: TOUCH_TARGET_MIN_PX,
    boxSizing: 'border-box',
    padding: chrome.selectTriggerPadding,
    backgroundColor: theme.background.secondary,
    border: `1px solid ${theme.border.primary}`,
    borderRadius: `${redesignRadius.control}px`,
    color: theme.text.primary,
    fontSize: `${chrome.buttonFontRem}rem`,
  };

  useEffect(() => {
    loadPresets();
    void loadTemplates();
    void loadPrebuiltTemplates();
  }, [loadPresets, loadTemplates, loadPrebuiltTemplates]);

  useEffect(() => {
    if (sharedToastReadyRef.current) {
      for (const template of sharedTemplates) {
        const previous = sharedModifiedRef.current.get(template.id);
        const next = template.metadata.modified;
        if (previous && next && previous !== next) {
          toast(`« ${template.name} » a été mis à jour`, 'info');
        }
      }
    }
    sharedToastReadyRef.current = true;
    const nextMap = new Map<string, string>();
    for (const template of sharedTemplates) {
      if (template.metadata.modified) {
        nextMap.set(template.id, template.metadata.modified);
      }
    }
    sharedModifiedRef.current = nextMap;
  }, [sharedTemplates, toast]);

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

  const handleCopyPrebuilt = async (prebuilt: PrebuiltTemplate) => {
    if (copyingPrebuiltRef.current) {
      return;
    }
    copyingPrebuiltRef.current = true;
    setIsCopyingPrebuilt(true);
    try {
      await createTemplate({
        name: `${prebuilt.name} (copie)`.slice(0, 120),
        description: prebuilt.description,
        category: prebuilt.category,
        icon: prebuilt.icon,
        configuration: prebuilt.configuration,
      });
      setNameFilter('');
      setCategoryFilter('');
      setContextFilter('');
      toast('Template copié dans Mes templates', 'success');
      setViewingPrebuilt(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Copie impossible';
      toast(message, 'error');
    } finally {
      copyingPrebuiltRef.current = false;
      setIsCopyingPrebuilt(false);
    }
  };

  const handleCopyShared = async (template: Template) => {
    if (copyingSharedRef.current) {
      return;
    }
    copyingSharedRef.current = true;
    setIsCopyingShared(true);
    try {
      await copyTemplateApi(template.id);
      await loadTemplates();
      toast('Template copié dans Mes templates', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Copie impossible';
      toast(message, 'error');
    } finally {
      copyingSharedRef.current = false;
      setIsCopyingShared(false);
    }
  };

  const handlePublishTemplate = async (template: Template) => {
    if (publishingRef.current || isGuest) {
      return;
    }
    publishingRef.current = true;
    try {
      await publishMarketplaceTemplateApi(template.id);
      toast(`« ${template.name} » publié sur le marketplace`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Publication impossible';
      toast(message, 'error');
    } finally {
      publishingRef.current = false;
    }
  };

  const handleLoadPrebuilt = (prebuilt: PrebuiltTemplate) => {
    onPrebuiltLoaded?.(prebuilt);
    setViewingPrebuilt(null);
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

  const handleDeleteTemplate = async () => {
    if (!deletingTemplate || deletingTemplateRef.current) return;
    deletingTemplateRef.current = true;
    try {
      await deleteTemplate(deletingTemplate.id);
      toast('Template supprimé', 'success');
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Échec de la suppression du template';
      toast(message, 'error');
    } finally {
      deletingTemplateRef.current = false;
      setDeletingTemplate(null);
    }
  };

  const openDeleteConfirm = (preset: Preset, e: React.MouseEvent) => {
    e.stopPropagation();
    setPresetToDelete(preset);
    setIsDeleteConfirmOpen(true);
  };

  const filterFields = (
    <div
      data-testid="mes-templates-filters"
      style={{
        display: 'flex',
        flexDirection: isNarrow ? 'column' : 'row',
        flexWrap: isNarrow ? 'nowrap' : 'wrap',
        gap: `${chrome.controlGapRem}rem`,
        marginBottom: isNarrow ? 0 : `${chrome.controlGapRem}rem`,
        padding: isNarrow ? chrome.cardPadding : undefined,
      }}
    >
      <label style={{ flex: '1 1 9rem', minWidth: isNarrow ? 0 : '9rem', color: theme.text.secondary, fontSize: `${chrome.labelFontRem}rem` }}>
        Nom
        <input
          data-testid="template-filter-name"
          type="search"
          value={nameFilter}
          onChange={(event) => setNameFilter(event.target.value)}
          placeholder="Filtrer par nom"
          aria-label="Filtrer par nom"
          style={{ ...filterInputStyle, marginTop: '0.25rem' }}
        />
      </label>
      <label style={{ flex: '1 1 9rem', minWidth: isNarrow ? 0 : '9rem', color: theme.text.secondary, fontSize: `${chrome.labelFontRem}rem` }}>
        Catégorie
        <input
          data-testid="template-filter-category"
          type="search"
          list="template-filter-category-options"
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          placeholder="Filtrer par catégorie"
          aria-label="Filtrer par catégorie"
          style={{ ...filterInputStyle, marginTop: '0.25rem' }}
        />
        <datalist id="template-filter-category-options">
          {categoryOptions.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      </label>
      <label style={{ flex: '1 1 9rem', minWidth: isNarrow ? 0 : '9rem', color: theme.text.secondary, fontSize: `${chrome.labelFontRem}rem` }}>
        Contexte
        <input
          data-testid="template-filter-context"
          type="search"
          value={contextFilter}
          onChange={(event) => setContextFilter(event.target.value)}
          placeholder="Filtrer par contexte GDD"
          aria-label="Filtrer par contexte"
          style={{ ...filterInputStyle, marginTop: '0.25rem' }}
        />
      </label>
    </div>
  );

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

        <button
          type="button"
          data-testid="suggestions-open-btn"
          onClick={() => {
            setSuggestionRequest(
              buildSuggestionRequest(getCurrentConfiguration, currentConfiguration),
            );
            setIsSuggestionsOpen(true);
          }}
          style={{
            padding: chrome.buttonPadding,
            backgroundColor: theme.button.default.background,
            border: `1px solid ${theme.border.secondary}`,
            borderRadius: `${redesignRadius.control}px`,
            color: theme.button.default.color,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            fontSize: `${chrome.buttonFontRem}rem`,
            flex: isNarrow ? '1 1 auto' : undefined,
            minHeight: TOUCH_TARGET_MIN_PX,
          }}
        >
          Suggestions
        </button>

        <button
          type="button"
          data-testid="marketplace-open-btn"
          onClick={() => setIsMarketplaceOpen(true)}
          style={{
            padding: chrome.buttonPadding,
            backgroundColor: theme.button.default.background,
            border: `1px solid ${theme.border.secondary}`,
            borderRadius: `${redesignRadius.control}px`,
            color: theme.button.default.color,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            fontSize: `${chrome.buttonFontRem}rem`,
            flex: isNarrow ? '1 1 auto' : undefined,
            minHeight: TOUCH_TARGET_MIN_PX,
          }}
        >
          Marketplace
        </button>

        <button
          type="button"
          data-testid="ab-test-open-btn"
          onClick={() => setIsAbTestOpen(true)}
          style={{
            padding: chrome.buttonPadding,
            backgroundColor: theme.button.default.background,
            border: `1px solid ${theme.border.secondary}`,
            borderRadius: `${redesignRadius.control}px`,
            color: theme.button.default.color,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            fontSize: `${chrome.buttonFontRem}rem`,
            flex: isNarrow ? '1 1 auto' : undefined,
            minHeight: TOUCH_TARGET_MIN_PX,
          }}
        >
          A/B tester
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
        onCreated={() => {
          setNameFilter('');
          setCategoryFilter('');
          setContextFilter('');
        }}
        onClose={() => {
          setIsCreateModalOpen(false);
          setSnapshotConfiguration(null);
        }}
      />

      <TemplateEditorModal
        key={editingTemplate?.id ?? 'closed'}
        isOpen={editingTemplate != null}
        template={editingTemplate}
        captureSnapshot={captureTemplateSnapshot}
        onSaved={() => {
          setNameFilter('');
          setCategoryFilter('');
          setContextFilter('');
        }}
        onClose={() => setEditingTemplate(null)}
      />

      <PrebuiltTemplateModal
        isOpen={viewingPrebuilt != null}
        template={viewingPrebuilt}
        onClose={() => setViewingPrebuilt(null)}
        onLoad={handleLoadPrebuilt}
        onCopy={(prebuilt) => {
          void handleCopyPrebuilt(prebuilt);
        }}
        copyDisabled={isCopyingPrebuilt}
      />

      <TemplateSuggestionsModal
        isOpen={isSuggestionsOpen}
        onClose={() => setIsSuggestionsOpen(false)}
        request={suggestionRequest}
        onLoad={async (item) => {
          await onSuggestionLoaded?.(item);
        }}
      />

      <TemplateMarketplaceModal
        isOpen={isMarketplaceOpen}
        onClose={() => setIsMarketplaceOpen(false)}
        currentUserId={currentUser?.id ?? null}
        currentUserRole={currentUser?.role ?? null}
        isGuest={Boolean(isGuest)}
        onCopied={() => loadTemplates()}
      />

      <TemplateABTestingModal
        isOpen={isAbTestOpen}
        onClose={() => setIsAbTestOpen(false)}
        templates={templates}
        prebuiltTemplates={prebuiltTemplates}
      />

      <section
        data-testid="prebuilt-templates-list"
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
          Templates pré-built
        </h3>
        {prebuiltError ? (
          <div data-testid="prebuilt-templates-error" style={{ color: theme.state.error.color }}>
            {prebuiltError}
          </div>
        ) : prebuiltLoading ? (
          <div data-testid="prebuilt-templates-loading" style={{ color: theme.text.secondary }}>
            Chargement…
          </div>
        ) : prebuiltTemplates.length === 0 ? (
          <div data-testid="prebuilt-templates-empty" style={{ color: theme.text.secondary }}>
            Aucun template pré-built
          </div>
        ) : (
          prebuiltTemplates.map((prebuilt) => (
            <div
              key={prebuilt.id}
              data-testid="prebuilt-template-item"
              data-prebuilt-id={prebuilt.id}
              data-prebuilt-name={prebuilt.name}
              onClick={() => setViewingPrebuilt(prebuilt)}
              style={{
                padding: chrome.dropdownOptionPadding,
                border: `1px solid ${theme.border.secondary}`,
                borderRadius: `${redesignRadius.control}px`,
                marginBottom: '0.35rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>{prebuilt.icon}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, color: theme.text.primary }}>
                  {prebuilt.name}
                  {isPrebuiltNew(prebuilt.addedAt) && (
                    <span
                      data-testid="prebuilt-new-badge"
                      style={{
                        marginLeft: '0.5rem',
                        fontSize: `${chrome.labelFontRem}rem`,
                        fontWeight: 600,
                        color: theme.state.info?.color ?? theme.text.secondary,
                      }}
                    >
                      Nouveau
                    </span>
                  )}
                </div>
                {prebuilt.description && (
                  <div
                    style={{
                      fontSize: `${chrome.labelFontRem}rem`,
                      color: theme.text.secondary,
                    }}
                  >
                    {prebuilt.description}
                  </div>
                )}
                <div
                  data-testid="prebuilt-item-gdd-system"
                  style={{
                    fontSize: `${chrome.labelFontRem}rem`,
                    color: theme.text.secondary,
                  }}
                >
                  {prebuilt.gddSystem}
                </div>
                <div
                  data-testid="prebuilt-item-scene-type"
                  style={{
                    fontSize: `${chrome.labelFontRem}rem`,
                    color: theme.text.secondary,
                  }}
                >
                  {prebuilt.sceneTypeHint}
                </div>
                <div
                  data-testid="prebuilt-item-preview"
                  style={{
                    fontSize: `${chrome.labelFontRem}rem`,
                    color: theme.text.secondary,
                  }}
                >
                  {prebuilt.configuration.instructions.slice(0, 120)}
                  {prebuilt.configuration.instructions.length > 120 ? '…' : ''}
                </div>
                <button
                  type="button"
                  data-testid="prebuilt-item-copy-btn"
                  disabled={isCopyingPrebuilt}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleCopyPrebuilt(prebuilt);
                  }}
                  style={{
                    minHeight: TOUCH_TARGET_MIN_PX,
                    marginTop: '0.5rem',
                    padding: chrome.buttonPadding,
                    backgroundColor: theme.button.default.background,
                    border: `1px solid ${theme.border.secondary}`,
                    borderRadius: `${redesignRadius.control}px`,
                    color: theme.button.default.color,
                    cursor: 'pointer',
                    fontSize: `${chrome.buttonFontRem}rem`,
                  }}
                >
                  Copier vers mes templates
                </button>
              </div>
            </div>
          ))
        )}
      </section>

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
        {ownedTemplates.length > 0 &&
          (isNarrow ? (
            <>
              <button
                type="button"
                data-testid="template-filters-open-btn"
                onClick={() => setFiltersOpen(true)}
                style={{
                  minHeight: TOUCH_TARGET_MIN_PX,
                  marginBottom: `${chrome.controlGapRem}rem`,
                  padding: chrome.buttonPadding,
                  backgroundColor: theme.button.default.background,
                  border: `1px solid ${theme.border.secondary}`,
                  borderRadius: `${redesignRadius.control}px`,
                  color: theme.button.default.color,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: `${chrome.buttonFontRem}rem`,
                  width: '100%',
                }}
              >
                Filtrer
              </button>
              <NarrowOverlayDrawer
                open={filtersOpen}
                side="right"
                titleId="mes-templates-filters-title"
                title="Filtrer les templates"
                closeLabel="Fermer les filtres"
                onClose={() => setFiltersOpen(false)}
              >
                {filterFields}
              </NarrowOverlayDrawer>
            </>
          ) : (
            filterFields
          ))}
        {templateError && ownedTemplates.length === 0 ? null : ownedTemplates.length === 0 ? (
          <div
            data-testid="mes-templates-empty"
            style={{
              fontSize: `${chrome.labelFontRem}rem`,
              color: theme.text.secondary,
            }}
          >
            Aucun template sauvegardé
          </div>
        ) : filteredTemplates.length === 0 ? (
          <>
            <div
              data-testid="mes-templates-no-match"
              style={{
                fontSize: `${chrome.labelFontRem}rem`,
                color: theme.text.secondary,
              }}
            >
              Aucun résultat
            </div>
            {hasActiveFilters && (
              <div
                data-testid="mes-templates-active-filters"
                style={{
                  fontSize: `${chrome.labelFontRem}rem`,
                  color: theme.text.secondary,
                  marginTop: '0.35rem',
                }}
              >
                {formatActiveTemplateFilters(nameFilter, categoryFilter, contextFilter)}
              </div>
            )}
          </>
        ) : (
          groupedTemplates.map(([category, items]) => (
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
              {items.map((template: Template) => {
                const modifiedAt = templateLatestAt(template)
                return (
                <div
                  key={template.id}
                  data-testid="template-item"
                  data-template-name={template.name}
                  data-template-category={template.category}
                  onClick={() => onTemplateLoaded?.(template)}
                  style={{
                    padding: chrome.dropdownOptionPadding,
                    border: `1px solid ${theme.border.secondary}`,
                    borderRadius: `${redesignRadius.control}px`,
                    marginBottom: '0.35rem',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.5rem',
                    cursor: 'pointer',
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
                    {modifiedAt && (
                      <div
                        data-testid="template-item-modified"
                        style={{
                          fontSize: `${chrome.labelFontRem}rem`,
                          color: theme.text.secondary,
                        }}
                      >
                        Modifié le {formatTemplateDate(modifiedAt)}
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
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '0.35rem',
                        marginTop: '0.5rem',
                      }}
                    >
                      <button
                        type="button"
                        data-testid="template-item-edit-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditingTemplate(template);
                        }}
                        style={{
                          minHeight: TOUCH_TARGET_MIN_PX,
                          padding: chrome.buttonPadding,
                          backgroundColor: theme.button.default.background,
                          border: `1px solid ${theme.border.secondary}`,
                          borderRadius: `${redesignRadius.control}px`,
                          color: theme.button.default.color,
                          cursor: 'pointer',
                          fontSize: `${chrome.buttonFontRem}rem`,
                        }}
                      >
                        Éditer
                      </button>
                      <button
                        type="button"
                        data-testid="template-item-delete-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeletingTemplate(template);
                        }}
                        style={{
                          minHeight: TOUCH_TARGET_MIN_PX,
                          padding: chrome.buttonPadding,
                          backgroundColor: theme.button.default.background,
                          border: `1px solid ${theme.border.secondary}`,
                          borderRadius: `${redesignRadius.control}px`,
                          color: theme.state.error.color,
                          cursor: 'pointer',
                          fontSize: `${chrome.buttonFontRem}rem`,
                        }}
                      >
                        Supprimer
                      </button>
                      {!isGuest && (
                        <button
                          type="button"
                          data-testid="template-item-publish-btn"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handlePublishTemplate(template);
                          }}
                          style={{
                            minHeight: TOUCH_TARGET_MIN_PX,
                            padding: chrome.buttonPadding,
                            backgroundColor: theme.button.default.background,
                            border: `1px solid ${theme.border.secondary}`,
                            borderRadius: `${redesignRadius.control}px`,
                            color: theme.button.default.color,
                            cursor: 'pointer',
                            fontSize: `${chrome.buttonFontRem}rem`,
                          }}
                        >
                          Publier
                        </button>
                      )}
                      {canShareTemplate(template) && (
                        <button
                          type="button"
                          data-testid="template-item-share-btn"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSharingTemplate(template);
                          }}
                          style={{
                            minHeight: TOUCH_TARGET_MIN_PX,
                            padding: chrome.buttonPadding,
                            backgroundColor: theme.button.default.background,
                            border: `1px solid ${theme.border.secondary}`,
                            borderRadius: `${redesignRadius.control}px`,
                            color: theme.button.default.color,
                            cursor: 'pointer',
                            fontSize: `${chrome.buttonFontRem}rem`,
                          }}
                        >
                          Partager
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                )
              })}
            </div>
          ))
        )}
      </section>

      <section
        data-testid="templates-partages-list"
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
          Templates partagés
        </h3>
        {sharedTemplates.length === 0 ? (
          <div
            data-testid="templates-partages-empty"
            style={{
              fontSize: `${chrome.labelFontRem}rem`,
              color: theme.text.secondary,
            }}
          >
            Aucun template partagé
          </div>
        ) : (
          sharedTemplates.map((template) => (
            <div
              key={template.id}
              data-testid="shared-template-item"
              data-template-name={template.name}
              onClick={() => onTemplateLoaded?.(template)}
              style={{
                padding: chrome.dropdownOptionPadding,
                border: `1px solid ${theme.border.secondary}`,
                borderRadius: `${redesignRadius.control}px`,
                marginBottom: '0.35rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>{template.icon}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, color: theme.text.primary }}>
                  {template.name}
                </div>
                <div
                  data-testid="shared-template-badge"
                  style={{
                    fontSize: `${chrome.labelFontRem}rem`,
                    color: theme.text.secondary,
                    marginTop: '0.2rem',
                  }}
                >
                  Partagé par {template.sharedByUsername ?? template.ownerUsername ?? 'un membre'}
                </div>
                <button
                  type="button"
                  data-testid="shared-template-copy-btn"
                  disabled={isCopyingShared}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleCopyShared(template);
                  }}
                  style={{
                    minHeight: TOUCH_TARGET_MIN_PX,
                    marginTop: '0.5rem',
                    padding: chrome.buttonPadding,
                    backgroundColor: theme.button.default.background,
                    border: `1px solid ${theme.border.secondary}`,
                    borderRadius: `${redesignRadius.control}px`,
                    color: theme.button.default.color,
                    cursor: 'pointer',
                    fontSize: `${chrome.buttonFontRem}rem`,
                  }}
                >
                  Copier vers mes templates
                </button>
              </div>
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

      <ConfirmDialog
        isOpen={deletingTemplate != null}
        title="Supprimer ce template ?"
        message={
          deletingTemplate
            ? `Le template « ${deletingTemplate.name} » sera retiré définitivement.`
            : ''
        }
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        variant="danger"
        onConfirm={() => {
          void handleDeleteTemplate();
        }}
        onCancel={() => setDeletingTemplate(null)}
      />

      {sharingTemplate && (
        <TemplateSharingModal
          templateId={sharingTemplate.id}
          templateName={sharingTemplate.name}
          open
          onClose={() => setSharingTemplate(null)}
        />
      )}
    </div>
  );
};
