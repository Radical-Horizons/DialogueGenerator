/**
 * Tests pour PresetSelector
 */
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import { PresetSelector } from '../components/generation/PresetSelector';
import { GenerationPanelNarrowProvider } from '../components/generation/GenerationPanelNarrowContext';
import { usePresetStore } from '../store/presetStore';
import { useTemplateStore } from '../store/templateStore';
import { useGenerationStore } from '../store/generationStore';
import { useContextStore } from '../store/contextStore';
import type { Preset } from '../types/preset';
import type { Template, PrebuiltTemplate } from '../types/template';

const { authState, mockPublishMarketplace } = vi.hoisted(() => ({
  authState: {
    user: { id: 'writer-a', username: 'writer-a', role: 'writer' as string },
  },
  mockPublishMarketplace: vi.fn(),
}));

vi.mock('../store/presetStore');
vi.mock('../store/templateStore');
vi.mock('../store/authStore', () => ({
  useAuthStore: (selector?: (state: typeof authState) => unknown) =>
    typeof selector === 'function' ? selector(authState) : authState,
}));
vi.mock('../api/templates', () => ({
  publishMarketplaceTemplateApi: (...args: unknown[]) => mockPublishMarketplace(...args),
  listMarketplaceTemplatesApi: vi.fn().mockResolvedValue([]),
  rateMarketplaceTemplateApi: vi.fn(),
  listAbTestsApi: vi.fn().mockResolvedValue([]),
  startAbTestApi: vi.fn(),
  getAbTestApi: vi.fn(),
  patchAbTestFeedbackApi: vi.fn(),
  rerunAbTestApi: vi.fn(),
  copyTemplateApi: vi.fn().mockResolvedValue({ id: 'copy-1', warnings: [] }),
  listTemplateSharesApi: vi.fn().mockResolvedValue([]),
  listTemplateShareTargetsApi: vi.fn().mockResolvedValue([]),
  createTemplateShareApi: vi.fn(),
  deleteTemplateShareApi: vi.fn(),
  suggestTemplatesApi: vi.fn().mockResolvedValue([]),
  recordSuggestionUsedApi: vi.fn().mockResolvedValue({ source: 'prebuilt', id: 'x', useCount: 1 }),
  listMarketplaceCommentsApi: vi.fn().mockResolvedValue([]),
  createMarketplaceCommentApi: vi.fn(),
  listTemplateVersionsApi: vi.fn().mockResolvedValue([]),
  restoreTemplateVersionApi: vi.fn(),
  setMarketplaceOfficialApi: vi.fn(),
}));
vi.mock('../api/graph', () => ({
  getContextDroppingRules: vi.fn().mockResolvedValue({
    rules_profile: 'strict',
    tolerance: null,
    mandatory_info: [],
    dialogue_type_overrides: {},
    schema_version: '1.0',
  }),
}));
vi.mock('../store/llmStore', () => ({
  useLLMStore: {
    getState: () => ({
      provider: 'openai',
      model: 'gpt-5.6-terra',
      availableModels: [],
    }),
  },
}));

// Mock le theme (complet pour SaveStatusIndicator importé via shared)
vi.mock('../theme', () => ({
  theme: {
    background: {
      primary: '#000',
      secondary: '#111',
      panel: '#222',
      panelHeader: '#1a1a1a',
    },
    text: {
      primary: '#fff',
      secondary: '#ccc',
      tertiary: '#888',
    },
    border: {
      primary: '#444',
      secondary: '#333',
    },
    input: {
      background: '#111',
      border: '#444',
    },
    button: {
      default: {
        background: '#333',
        color: '#fff',
      },
      primary: {
        background: '#007bff',
        color: '#fff',
      },
    },
    state: {
      error: {
        color: '#dc3545',
        background: '#3a1a1a',
        border: '#ff4444',
      },
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
  const mockUpdatePreset = vi.fn();
  const mockDeletePreset = vi.fn();
  const mockSetSelectedPreset = vi.fn();
  const mockOnPresetLoaded = vi.fn();
  const mockOnTemplateLoaded = vi.fn();
  const mockLoadTemplates = vi.fn();
  const mockLoadPrebuiltTemplates = vi.fn();
  const mockCreateTemplate = vi.fn();
  const mockUpdateTemplate = vi.fn();
  const mockDeleteTemplate = vi.fn();

  const mockTemplates: Template[] = [
    {
      id: 'tpl-1',
      name: 'Salut A',
      description: 'Première rencontre',
      category: 'Salutation',
      icon: '👋',
      metadata: { created: '2026-08-16T10:00:00Z', modified: '2026-08-16T10:00:00Z' },
      relation: 'owned' as const,
      configuration: {
        characters: ['char-alpha'],
        locations: ['loc-alpha'],
        region: 'loc-alpha',
        sceneType: 'Generic',
        instructions: 'Brief A',
      },
    },
    {
      id: 'tpl-2',
      name: 'Combat B',
      description: 'Affrontement',
      category: 'Confrontation',
      icon: '⚔️',
      metadata: { created: '2026-08-16T10:00:00Z', modified: '2026-08-16T10:00:00Z' },
      relation: 'owned' as const,
      configuration: {
        characters: ['char-beta'],
        locations: [],
        region: '',
        sceneType: 'Generic',
        instructions: 'Brief B',
      },
    },
    {
      id: 'tpl-3',
      name: 'Salut C',
      description: '',
      category: 'Salutation',
      icon: '🙂',
      metadata: { created: '2026-08-16T10:00:00Z', modified: '2026-08-16T10:00:00Z' },
      relation: 'owned' as const,
      configuration: {
        characters: [],
        locations: ['loc-beta'],
        region: 'loc-beta',
        sceneType: 'Generic',
        instructions: '',
      },
    },
  ];

  function mockTemplateStore(templates: Template[] = mockTemplates): void {
    const state = {
      templates,
      prebuiltTemplates: [] as PrebuiltTemplate[],
      isLoading: false,
      error: null,
      prebuiltError: null,
      prebuiltLoading: false,
      loadTemplates: mockLoadTemplates,
      loadPrebuiltTemplates: mockLoadPrebuiltTemplates,
      createTemplate: mockCreateTemplate,
      updateTemplate: mockUpdateTemplate,
      deleteTemplate: mockDeleteTemplate,
      reset: vi.fn(),
    };
    (useTemplateStore as unknown as Mock).mockImplementation(
      (selector?: (store: typeof state) => unknown) =>
        typeof selector === 'function' ? selector(state) : state
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = { id: 'writer-a', username: 'writer-a', role: 'writer' };
    mockPublishMarketplace.mockResolvedValue({ id: 'listing-1' });
    useGenerationStore.getState().setContextDroppingRulesOverlay(null)
    useContextStore.setState({
      selections: {
        ...useContextStore.getState().selections,
        characters_full: [],
        characters_excerpt: [],
      },
      characters: [],
    })
    mockCreateTemplate.mockResolvedValue({ warnings: [] });
    mockUpdateTemplate.mockResolvedValue({ warnings: [] });
    mockDeleteTemplate.mockResolvedValue(undefined);

    (usePresetStore as unknown as Mock).mockReturnValue({
      presets: [mockPreset],
      selectedPreset: null,
      isLoading: false,
      error: null,
      loadPresets: mockLoadPresets,
      createPreset: mockCreatePreset,
      updatePreset: mockUpdatePreset,
      deletePreset: mockDeletePreset,
      setSelectedPreset: mockSetSelectedPreset,
    });
    mockTemplateStore();
  });

  describe('Rendering', () => {
    it('affiche l’erreur template au lieu d’une liste vide', () => {
      mockTemplateStore([]);
      const state = {
        templates: [] as Template[],
        prebuiltTemplates: [] as PrebuiltTemplate[],
        isLoading: false,
        error: 'Échec du chargement des templates : 500',
        prebuiltError: null,
        prebuiltLoading: false,
        loadTemplates: mockLoadTemplates,
        loadPrebuiltTemplates: mockLoadPrebuiltTemplates,
        createTemplate: mockCreateTemplate,
        updateTemplate: vi.fn(),
        deleteTemplate: vi.fn(),
        reset: vi.fn(),
      };
      (useTemplateStore as unknown as Mock).mockImplementation(
        (selector?: (store: typeof state) => unknown) =>
          typeof selector === 'function' ? selector(state) : state
      );

      render(<PresetSelector onPresetLoaded={mockOnPresetLoaded} />);

      expect(screen.getByTestId('mes-templates-error')).toHaveTextContent(
        'Échec du chargement des templates : 500'
      );
      expect(screen.queryByTestId('template-catalog-empty')).not.toBeInTheDocument();
    });

    /**
     * Critère d'acceptation principal de la story 6.8.
     *
     * Régression : `templates.filter(t => t.relation !== 'team')` écartait ce template
     * et aucune section ne l'affichait — donc invisible, alors que « partagé » est le
     * statut par défaut. Ce test échoue sur l'implémentation précédente.
     */
    it("affiche et rend éditable le template partagé d'un collègue", () => {
      mockTemplateStore([
        ...mockTemplates,
        {
          id: 'tpl-equipe',
          name: 'Négociation collègue',
          description: "Écrit par quelqu'un d'autre",
          category: 'Négociation',
          icon: '🤝',
          metadata: { created: '2026-08-20T10:00:00Z', modified: '2026-08-20T10:00:00Z' },
          ownerId: 'writer-b',
          visibility: 'shared' as const,
          relation: 'team' as const,
          configuration: {
            characters: [],
            locations: [],
            region: '',
            sceneType: 'Generic',
            instructions: 'Brief équipe',
          },
        },
      ]);
      render(<PresetSelector onPresetLoaded={mockOnPresetLoaded} />);

      const ligne = screen
        .getAllByTestId('template-item')
        .find((el) => el.getAttribute('data-template-name') === 'Négociation collègue');

      expect(ligne).toBeDefined();
      expect(ligne).toHaveAttribute('data-catalogue-badge', 'partagé');

      // Ce qui est partagé appartient à l'équipe qui le voit : elle l'édite. Un verrou
      // de propriété par-dessus rendait la moitié de la liste inerte, admin compris.
      const dansLaLigne = within(ligne as HTMLElement);
      expect(dansLaLigne.getByTestId('template-item-edit-btn')).toBeInTheDocument();
      expect(dansLaLigne.getByTestId('template-item-delete-btn')).toBeInTheDocument();
      expect(dansLaLigne.getByTestId('template-visibility-toggle')).toBeInTheDocument();
    });

    it('groupe les templates par catégorie dans la liste unique', () => {
      render(<PresetSelector onPresetLoaded={mockOnPresetLoaded} />);

      // Plus de titre de section : la visibilité est un statut, pas un découpage.
      expect(screen.queryByText('Mes templates')).not.toBeInTheDocument();
      expect(screen.queryByText('Templates pré-built')).not.toBeInTheDocument();
      expect(screen.getByTestId('template-catalog')).toBeInTheDocument();
      const groups = screen.getAllByTestId('template-category-group');
      expect(groups).toHaveLength(2);
      expect(groups[0]).toHaveAttribute('data-category', 'Salutation');
      expect(groups[1]).toHaveAttribute('data-category', 'Confrontation');
      expect(screen.getByText('Salut A')).toBeInTheDocument();
      expect(screen.getByText('Combat B')).toBeInTheDocument();
      expect(screen.getByText('Salut C')).toBeInTheDocument();
      expect(screen.getByText(/Contexte : char-alpha/i)).toBeInTheDocument();
      expect(screen.getAllByTestId('template-item-modified')).toHaveLength(3);
      expect(screen.getAllByTestId('template-item-modified')[0]).toHaveTextContent(/Modifié le/i);
    });

    it('applique le template au clic sur la carte', () => {
      render(
        <PresetSelector
          onPresetLoaded={mockOnPresetLoaded}
          onTemplateLoaded={mockOnTemplateLoaded}
        />,
      );

      fireEvent.click(screen.getByText('Salut A'));

      expect(mockOnTemplateLoaded).toHaveBeenCalledTimes(1);
      expect(mockOnTemplateLoaded).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'tpl-1', name: 'Salut A' }),
      );
      expect(mockOnPresetLoaded).not.toHaveBeenCalled();
      expect(mockSetSelectedPreset).not.toHaveBeenCalled();
    });

    it('n’applique pas au clic Éditer', () => {
      render(
        <PresetSelector
          onPresetLoaded={mockOnPresetLoaded}
          onTemplateLoaded={mockOnTemplateLoaded}
        />,
      );

      fireEvent.click(screen.getAllByTestId('template-item-edit-btn')[0]);

      expect(mockOnTemplateLoaded).not.toHaveBeenCalled();
      expect(screen.getByTestId('template-editor-modal')).toBeInTheDocument();
    });

    it('n’applique pas au clic Supprimer', () => {
      render(
        <PresetSelector
          onPresetLoaded={mockOnPresetLoaded}
          onTemplateLoaded={mockOnTemplateLoaded}
        />,
      );

      fireEvent.click(screen.getAllByTestId('template-item-delete-btn')[0]);

      expect(mockOnTemplateLoaded).not.toHaveBeenCalled();
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });

    it('ouvre l’éditeur prérempli au clic Éditer', () => {
      render(<PresetSelector onPresetLoaded={mockOnPresetLoaded} />);

      fireEvent.click(screen.getAllByTestId('template-item-edit-btn')[0]);

      expect(screen.getByTestId('template-editor-modal')).toBeInTheDocument();
      expect(screen.getByTestId('template-edit-name')).toHaveValue('Salut A');
      expect(screen.getByTestId('template-edit-instructions')).toHaveValue('Brief A');
    });

    it('annuler la suppression laisse l’item', () => {
      render(<PresetSelector onPresetLoaded={mockOnPresetLoaded} />);

      fireEvent.click(screen.getAllByTestId('template-item-delete-btn')[0]);
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));

      expect(mockDeleteTemplate).not.toHaveBeenCalled();
      expect(screen.getByText('Salut A')).toBeInTheDocument();
    });

    it('confirmer la suppression appelle deleteTemplate', async () => {
      render(<PresetSelector onPresetLoaded={mockOnPresetLoaded} />);

      fireEvent.click(screen.getAllByTestId('template-item-delete-btn')[0]);
      fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

      await waitFor(() => {
        expect(mockDeleteTemplate).toHaveBeenCalledWith('tpl-1');
      });
    });

    it('n’envoie qu’un seul DELETE si on double-clique confirmer', async () => {
      let resolveDelete: (() => void) | undefined;
      mockDeleteTemplate.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveDelete = resolve;
          }),
      );

      render(<PresetSelector onPresetLoaded={mockOnPresetLoaded} />);

      fireEvent.click(screen.getAllByTestId('template-item-delete-btn')[0]);
      fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
      fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

      expect(mockDeleteTemplate).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveDelete?.();
      });
    });
  });

  describe('Mes templates suite', () => {
    it('reset les filtres après un enregistrement d’édition', async () => {
      render(<PresetSelector onPresetLoaded={mockOnPresetLoaded} />);

      fireEvent.change(screen.getByTestId('template-filter-name'), {
        target: { value: 'Salut A' },
      });
      expect(screen.queryByText('Combat B')).not.toBeInTheDocument();

      fireEvent.click(screen.getAllByTestId('template-item-edit-btn')[0]);
      fireEvent.click(screen.getByTestId('template-editor-save-btn'));

      await waitFor(() => {
        expect(mockUpdateTemplate).toHaveBeenCalled();
      });
      expect(screen.getByText('Combat B')).toBeInTheDocument();
    });
  });

  describe('Template filters', () => {
    it('filtre par nom (saisie partielle)', () => {
      render(<PresetSelector onPresetLoaded={mockOnPresetLoaded} />);

      fireEvent.change(screen.getByTestId('template-filter-name'), { target: { value: 'salut' } });

      expect(screen.getByText('Salut A')).toBeInTheDocument();
      expect(screen.getByText('Salut C')).toBeInTheDocument();
      expect(screen.queryByText('Combat B')).not.toBeInTheDocument();
      expect(screen.getAllByTestId('template-category-group')).toHaveLength(1);
    });

    it('filtre par catégorie → une section', () => {
      render(<PresetSelector onPresetLoaded={mockOnPresetLoaded} />);

      fireEvent.change(screen.getByTestId('template-filter-category'), {
        target: { value: 'Confrontation' },
      });

      expect(screen.getByText('Combat B')).toBeInTheDocument();
      expect(screen.queryByText('Salut A')).not.toBeInTheDocument();
      const groups = screen.getAllByTestId('template-category-group');
      expect(groups).toHaveLength(1);
      expect(groups[0]).toHaveAttribute('data-category', 'Confrontation');
    });

    it('filtre par contexte GDD (ID personnage)', () => {
      render(<PresetSelector onPresetLoaded={mockOnPresetLoaded} />);

      fireEvent.change(screen.getByTestId('template-filter-context'), {
        target: { value: 'char-alpha' },
      });

      expect(screen.getByText('Salut A')).toBeInTheDocument();
      expect(screen.queryByText('Combat B')).not.toBeInTheDocument();
      expect(screen.queryByText('Salut C')).not.toBeInTheDocument();
    });

    it('filtre par nom et contexte en ET', () => {
      render(<PresetSelector onPresetLoaded={mockOnPresetLoaded} />);

      fireEvent.change(screen.getByTestId('template-filter-name'), { target: { value: 'salut' } });
      fireEvent.change(screen.getByTestId('template-filter-context'), {
        target: { value: 'loc-beta' },
      });

      expect(screen.getByText('Salut C')).toBeInTheDocument();
      expect(screen.queryByText('Salut A')).not.toBeInTheDocument();
      expect(screen.queryByText('Combat B')).not.toBeInTheDocument();
    });

    it('aucun match → liste vide dédiée, pas « Aucun template sauvegardé »', () => {
      render(<PresetSelector onPresetLoaded={mockOnPresetLoaded} />);

      fireEvent.change(screen.getByTestId('template-filter-name'), {
        target: { value: 'zzzz-inexistant' },
      });

      expect(screen.getByTestId('template-catalog-no-match')).toHaveTextContent('Aucun résultat');
      expect(screen.getByTestId('mes-templates-filters')).toBeInTheDocument();
      expect(screen.getByTestId('template-catalog-active-filters')).toHaveTextContent(
        'Filtres : nom « zzzz-inexistant »',
      );
      expect(screen.queryByTestId('template-catalog-empty')).not.toBeInTheDocument();
      expect(screen.queryByTestId('template-item')).not.toBeInTheDocument();
    });

    it('ouvre un drawer de filtres en narrow avec cible tactile 44px', () => {
      render(
        <GenerationPanelNarrowProvider value={true}>
          <PresetSelector onPresetLoaded={mockOnPresetLoaded} />
        </GenerationPanelNarrowProvider>
      );

      expect(screen.queryByTestId('mes-templates-filters')).not.toBeInTheDocument();
      const openBtn = screen.getByTestId('template-filters-open-btn');
      expect(openBtn).toHaveStyle({ minHeight: '44px' });
      fireEvent.click(openBtn);

      const filters = screen.getByTestId('mes-templates-filters');
      expect(filters).toHaveStyle({ flexDirection: 'column' });
      expect(screen.getByTestId('template-filter-name')).toHaveStyle({ minHeight: '44px' });
      expect(screen.getByTestId('narrow-drawer-right')).toBeInTheDocument();
    });

    it('narrow + drawer fermé : les critères actifs restent visibles si aucun match', () => {
      render(
        <GenerationPanelNarrowProvider value={true}>
          <PresetSelector onPresetLoaded={mockOnPresetLoaded} />
        </GenerationPanelNarrowProvider>
      );

      fireEvent.click(screen.getByTestId('template-filters-open-btn'));
      fireEvent.change(screen.getByTestId('template-filter-name'), {
        target: { value: 'zzzz-inexistant' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Fermer les filtres' }));

      expect(screen.queryByTestId('mes-templates-filters')).not.toBeInTheDocument();
      expect(screen.getByTestId('template-catalog-no-match')).toHaveTextContent('Aucun résultat');
      expect(screen.getByTestId('template-catalog-active-filters')).toHaveTextContent(
        'Filtres : nom « zzzz-inexistant »',
      );
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
        updatePreset: mockUpdatePreset,
        deletePreset: mockDeletePreset,
        setSelectedPreset: mockSetSelectedPreset,
      });

      render(<PresetSelector onPresetLoaded={mockOnPresetLoaded} />);

      expect(screen.getByText(/failed to load presets/i)).toBeInTheDocument();
    });
  });

});
