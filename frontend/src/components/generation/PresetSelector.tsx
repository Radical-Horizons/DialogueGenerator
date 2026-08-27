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
import { migrateLocalBriefsToTemplates } from '../../utils/migrateLocalBriefsToTemplates';
import { useLLMStore } from '../../store/llmStore';
import type { Preset, PresetConfiguration } from '../../types/preset';
import type { Template, TemplateConfiguration, PrebuiltTemplate, TemplateSuggestion, TemplateSuggestionRequest } from '../../types/template';
import { theme } from '../../theme';
import {
  redesignRadius,
} from '../../theme/redesignTokens';
import { generationPanelChrome } from '../../theme/responsiveChrome';
import { TOUCH_TARGET_MIN_PX } from '../../constants';
import { useToast, SaveStatusIndicator, ConfirmDialog } from '../shared';
import { useGenerationPanelNarrow } from './GenerationPanelNarrowContext';
import { TemplateCreatorModal } from './TemplateCreatorModal';
import { TemplateEditorModal } from './TemplateEditorModal';
import { PrebuiltTemplateModal } from './PrebuiltTemplateModal';
import { TemplateSuggestionsModal } from './TemplateSuggestionsModal';
import { TemplateABTestingModal } from './TemplateABTestingModal';
import { NarrowOverlayDrawer } from '../layout/NarrowOverlayDrawer';
import { TEMPLATE_UNCATEGORIZED_LABEL } from '../../utils/templateGroups';
import { buildTemplateCatalog, filterCatalog } from '../../utils/templateCatalog';
import type { CatalogueItem, TemplateVisibility } from '../../utils/templateCatalog';
import { TemplateCatalogRow } from './TemplateCatalogRow';
import { useAuthStore } from '../../store/authStore';
import { useContextStore } from '../../store/contextStore';
import { useGenerationStore } from '../../store/generationStore';
import { rencontreInitialeBySelectedCharacters } from '../../utils/templateSuggestionScore';
import type { SaveStatus } from '../shared/SaveStatusIndicator';

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
  onTemplateLoaded,
  onPrebuiltLoaded,
  onSuggestionLoaded,
  currentConfiguration,
  getCurrentConfiguration,
  saveStatus,
}) => {
  const isNarrow = useGenerationPanelNarrow();
  const chrome = isNarrow ? generationPanelChrome.narrow : generationPanelChrome.comfortable;
  // Un invité consulte : proposer une action que le serveur refusera serait une
  // promesse que l'écran ne peut pas tenir.
  const readOnly = useAuthStore((s) => s.user?.role === 'guest');
  const {
    error,
    loadPresets,
    deletePreset,
  } = usePresetStore();
  const {
    templates,
    prebuiltTemplates,
    loadTemplates,
    loadPrebuiltTemplates,
    error: templateError,
    prebuiltError,
    prebuiltLoading,
    updateTemplate,
    deleteTemplate,
  } = useTemplateStore();
  const toast = useToast();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [presetToDelete, setPresetToDelete] = useState<Preset | null>(null);
  const [snapshotConfiguration, setSnapshotConfiguration] = useState<TemplateConfiguration | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<Template | null>(null);
  const [viewingPrebuilt, setViewingPrebuilt] = useState<PrebuiltTemplate | null>(null);
  const [nameFilter, setNameFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [contextFilter, setContextFilter] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const deletingTemplateRef = useRef(false);
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const [suggestionRequest, setSuggestionRequest] = useState<TemplateSuggestionRequest>({
    instructions: '',
    sceneType: '',
    characters: [],
    locations: [],
    rencontreInitialeByCharacter: {},
  });
  // Le statut est un filtre, pas un découpage : la liste reste une.
  const [visibilityFilter, setVisibilityFilter] = useState<'tous' | TemplateVisibility>('tous');
  const [isAbTestOpen, setIsAbTestOpen] = useState(false);
  const [abSeedBId, setAbSeedBId] = useState('');

  // Une seule liste : catalogue fourni, mes templates et ceux de l'équipe. Rien n'est
  // écarté ici — seul un filtre demandé par l'utilisateur retire des éléments. La version
  // précédente filtrait `relation !== 'team'`, ce qui rendait invisibles les templates
  // partagés par un collègue puisque aucune section ne les affichait.
  const catalogue = useMemo(() => buildTemplateCatalog(templates), [templates]);

  const filteredCatalogue = useMemo(
    () =>
      filterCatalog(catalogue, {
        name: nameFilter,
        category: categoryFilter,
        context: contextFilter,
        visibility: visibilityFilter,
      }),
    [catalogue, nameFilter, categoryFilter, contextFilter, visibilityFilter],
  );

  const groupedCatalogue = useMemo(() => {
    const groupes = new Map<string, CatalogueItem[]>();
    for (const item of filteredCatalogue) {
      const cle = item.category?.trim() || TEMPLATE_UNCATEGORIZED_LABEL;
      groupes.set(cle, [...(groupes.get(cle) ?? []), item]);
    }
    return Array.from(groupes.entries());
  }, [filteredCatalogue]);
  const categoryOptions = useMemo(() => {
    const keys = new Set(
      templates.map((template) => template.category?.trim() || TEMPLATE_UNCATEGORIZED_LABEL),
    );
    return Array.from(keys);
  }, [templates]);

  const hasActiveFilters = Boolean(
    nameFilter.trim() || categoryFilter.trim() || contextFilter.trim() || visibilityFilter !== 'tous',
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
    void loadPrebuiltTemplates();
    // Les briefs du navigateur rejoignent les templates serveur au premier passage.
    // La migration copie et se reprend d'elle-même : un échec n'empêche pas la liste
    // de s'afficher, il laisse simplement la migration ouverte pour la prochaine fois.
    void migrateLocalBriefsToTemplates()
      .catch((err) => console.warn('Migration des briefs locaux différée:', err))
      .finally(() => {
        void loadTemplates();
      });
  }, [loadPresets, loadTemplates, loadPrebuiltTemplates]);


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

  /**
   * Bascule le statut privé/partagé d'un template dont on est propriétaire.
   *
   * Le serveur refuse (403) si l'acteur n'est pas propriétaire : la pastille n'est
   * affichée que dans ce cas, la garde reste côté API.
   */
  const handleToggleVisibility = async (template: Template) => {
    const next = (template.visibility ?? 'shared') === 'private' ? 'shared' : 'private';
    try {
      await updateTemplate(template.id, { visibility: next });
      toast(
        next === 'private'
          ? 'Template repassé en brouillon privé'
          : "Template partagé avec l'équipe",
        'success',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Changement de statut impossible';
      toast(message, 'error');
    }
  };




  const handleLoadPrebuilt = (prebuilt: PrebuiltTemplate) => {
    onPrebuiltLoaded?.(prebuilt);
    setViewingPrebuilt(null);
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


  const visibilityOptions: Array<{ valeur: 'tous' | TemplateVisibility; libelle: string }> = [
    { valeur: 'tous', libelle: 'Tous' },
    { valeur: 'shared', libelle: 'Partagés' },
    { valeur: 'private', libelle: 'Privés' },
  ];

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
        Statut
        <select
          data-testid="template-filter-visibility"
          value={visibilityFilter}
          onChange={(event) => setVisibilityFilter(event.target.value as 'tous' | TemplateVisibility)}
          aria-label="Filtrer par statut"
          style={{ ...filterInputStyle, marginTop: '0.25rem' }}
        >
          {visibilityOptions.map((option) => (
            <option key={option.valeur} value={option.valeur}>
              {option.libelle}
            </option>
          ))}
        </select>
      </label>
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
      />

      <TemplateSuggestionsModal
        isOpen={isSuggestionsOpen}
        onClose={() => setIsSuggestionsOpen(false)}
        request={suggestionRequest}
        onLoad={async (item) => {
          await onSuggestionLoaded?.(item);
        }}
      />


      <TemplateABTestingModal
        isOpen={isAbTestOpen}
        onClose={() => {
          setIsAbTestOpen(false);
          setAbSeedBId('');
        }}
        templates={templates}
        prebuiltTemplates={prebuiltTemplates}
        initialBId={abSeedBId}
      />

      <section
        data-testid="template-catalog"
        style={{
          marginTop: `${chrome.controlGapRem}rem`,
        }}
      >
        {isNarrow ? (
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
              titleId="template-catalog-filters-title"
              title="Filtrer les templates"
              closeLabel="Fermer les filtres"
              onClose={() => setFiltersOpen(false)}
            >
              {filterFields}
            </NarrowOverlayDrawer>
          </>
        ) : (
          filterFields
        )}

        {prebuiltError && (
          <div data-testid="prebuilt-templates-error" style={{ color: theme.state.error.color }}>
            {prebuiltError}
          </div>
        )}

        {/* Le catalogue fourni arrive après les templates : on montre ce qu'on a déjà
            plutôt que de remplacer la liste par un indicateur. */}
        {prebuiltLoading && (
          <div data-testid="template-catalog-loading" style={{ color: theme.text.secondary }}>
            Chargement…
          </div>
        )}

        {catalogue.length === 0 ? (
          // Une erreur de chargement se dit une fois, en haut : ne pas la doubler d'un
          // « rien à afficher » qui laisserait croire que la liste est simplement vide.
          templateError || prebuiltError ? null : (
            <div data-testid="template-catalog-empty" style={{ color: theme.text.secondary }}>
              Vos templates et ceux de l'équipe s'afficheront ici.
            </div>
          )
        ) : filteredCatalogue.length === 0 ? (
          <>
            <div data-testid="template-catalog-no-match" style={{ color: theme.text.secondary }}>
              Aucun résultat
            </div>
            {hasActiveFilters && (
              <div
                data-testid="template-catalog-active-filters"
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
          groupedCatalogue.map(([category, items]) => (
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
              {items.map((item) => (
                <TemplateCatalogRow
                  key={item.key}
                  item={item}
                  chrome={chrome}
                  readOnly={readOnly}
                  onApply={(template) => onTemplateLoaded?.(template)}
                  onToggleVisibility={(template) => {
                    void handleToggleVisibility(template);
                  }}
                  onEdit={(template) => setEditingTemplate(template)}
                  onDelete={(template) => setDeletingTemplate(template)}
                />
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

    </div>
  );
};
