/**
 * Tests pour PresetSelector
 */
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { PresetSelector } from '../components/generation/PresetSelector';
import { GenerationPanelNarrowProvider } from '../components/generation/GenerationPanelNarrowContext';
import { usePresetStore } from '../store/presetStore';
import { useTemplateStore } from '../store/templateStore';
import type { Preset } from '../types/preset';
import type { Template } from '../types/template';

vi.mock('../store/presetStore');
vi.mock('../store/templateStore');
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
    },
    border: {
      primary: '#444',
      secondary: '#333',
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
      isLoading: false,
      error: null,
      loadTemplates: mockLoadTemplates,
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
    it('should render preset selector', () => {
      render(<PresetSelector onPresetLoaded={mockOnPresetLoaded} />);

      expect(screen.getByText(/charger preset/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^enregistrer$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sauvegarder comme template/i })).toBeInTheDocument();
    });

    it('should load presets on mount', () => {
      render(<PresetSelector onPresetLoaded={mockOnPresetLoaded} />);

      expect(mockLoadPresets).toHaveBeenCalledOnce();
      expect(mockLoadTemplates).toHaveBeenCalled();
    });

    it('affiche l’erreur template au lieu d’une liste vide', () => {
      mockTemplateStore([]);
      const state = {
        templates: [] as Template[],
        isLoading: false,
        error: 'Échec du chargement des templates : 500',
        loadTemplates: mockLoadTemplates,
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
      expect(screen.queryByTestId('mes-templates-empty')).not.toBeInTheDocument();
    });

    it('should show "Aucun preset" message when list is empty', () => {
      (usePresetStore as unknown as Mock).mockReturnValue({
        presets: [],
        selectedPreset: null,
        isLoading: false,
        error: null,
        loadPresets: mockLoadPresets,
        createPreset: mockCreatePreset,
        updatePreset: mockUpdatePreset,
        deletePreset: mockDeletePreset,
        setSelectedPreset: mockSetSelectedPreset,
      });
      mockTemplateStore([]);

      render(<PresetSelector onPresetLoaded={mockOnPresetLoaded} />);

      // Ouvrir dropdown
      const dropdown = screen.getByText(/charger preset/i);
      fireEvent.click(dropdown);

      expect(screen.getByText(/aucun preset sauvegardé/i)).toBeInTheDocument();
    });

    it('should group templates by category in Mes templates', () => {
      render(<PresetSelector onPresetLoaded={mockOnPresetLoaded} />);

      expect(screen.getByText('Mes templates')).toBeInTheDocument();
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

      expect(screen.getByTestId('mes-templates-no-match')).toHaveTextContent('Aucun résultat');
      expect(screen.getByTestId('mes-templates-filters')).toBeInTheDocument();
      expect(screen.getByTestId('mes-templates-active-filters')).toHaveTextContent(
        'Filtres : nom « zzzz-inexistant »',
      );
      expect(screen.queryByTestId('mes-templates-empty')).not.toBeInTheDocument();
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
      expect(screen.getByTestId('mes-templates-no-match')).toHaveTextContent('Aucun résultat');
      expect(screen.getByTestId('mes-templates-active-filters')).toHaveTextContent(
        'Filtres : nom « zzzz-inexistant »',
      );
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
    it('should open template modal when "Sauvegarder comme template" is clicked', async () => {
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

      const saveButton = screen.getByRole('button', { name: /sauvegarder comme template/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /sauvegarder comme template/i })).toBeInTheDocument();
      });
    });

    it('should create template with provided data, not a preset', async () => {
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

      fireEvent.click(screen.getByRole('button', { name: /sauvegarder comme template/i }));

      fireEvent.change(await screen.findByTestId('template-form-name'), {
        target: { value: 'New Template' },
      });
      fireEvent.change(screen.getByTestId('template-form-description'), {
        target: { value: 'Une desc' },
      });
      fireEvent.change(screen.getByTestId('template-form-category'), {
        target: { value: 'Confrontation' },
      });
      fireEvent.click(screen.getByTestId('template-modal-create-btn'));

      await waitFor(() => {
        expect(mockCreateTemplate).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'New Template',
            description: 'Une desc',
            category: 'Confrontation',
            configuration: expect.objectContaining({
              characters: ['char-001'],
              llmProvider: 'openai',
            }),
          })
        );
      });
      expect(mockCreatePreset).not.toHaveBeenCalled();
      const payload = mockCreateTemplate.mock.calls[0][0] as {
        configuration: { temperature?: number }
      };
      expect(payload.configuration.temperature).toBeUndefined();
    });

    it('réinitialise les filtres après une création réussie', async () => {
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

      fireEvent.change(screen.getByTestId('template-filter-name'), {
        target: { value: 'zzzz-inexistant' },
      });
      expect(screen.getByTestId('mes-templates-no-match')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /sauvegarder comme template/i }));
      fireEvent.change(await screen.findByTestId('template-form-name'), {
        target: { value: 'Nouveau visible' },
      });
      fireEvent.click(screen.getByTestId('template-modal-create-btn'));

      await waitFor(() => {
        expect(mockCreateTemplate).toHaveBeenCalled();
      });
      expect(screen.queryByTestId('mes-templates-no-match')).not.toBeInTheDocument();
      expect(screen.getByTestId('template-filter-name')).toHaveValue('');
      expect(screen.getByText('Salut A')).toBeInTheDocument();
    });

    it('snapshot via getCurrentConfiguration sans currentConfiguration', async () => {
      const getCurrentConfiguration = vi.fn(() => ({
        characters: ['char-from-callback'],
        locations: ['loc-from-callback'],
        region: 'region-from-callback',
        sceneType: 'Generic',
        instructions: 'Brief depuis le callback',
        llmModel: 'gpt-5.6-terra',
      }));

      render(
        <PresetSelector
          onPresetLoaded={mockOnPresetLoaded}
          getCurrentConfiguration={getCurrentConfiguration}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /sauvegarder comme template/i }));

      expect(getCurrentConfiguration).toHaveBeenCalled();
      const preview = await screen.findByTestId('template-form-preview');
      expect(preview).toHaveTextContent('Brief depuis le callback');
      expect(preview).toHaveTextContent('char-from-callback');

      fireEvent.change(screen.getByTestId('template-form-name'), {
        target: { value: 'Via callback' },
      });
      fireEvent.click(screen.getByTestId('template-modal-create-btn'));

      await waitFor(() => {
        expect(mockCreateTemplate).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Via callback',
            configuration: expect.objectContaining({
              characters: ['char-from-callback'],
              instructions: 'Brief depuis le callback',
              llmProvider: 'openai',
              llmModel: 'gpt-5.6-terra',
            }),
          })
        );
      });
      const payload = mockCreateTemplate.mock.calls[0][0] as {
        configuration: { temperature?: number }
      };
      expect(payload.configuration.temperature).toBeUndefined();
    });

    it('should update selected preset when "Enregistrer" is clicked', async () => {
      const mockCurrentConfiguration = {
        characters: ['char-001'],
        locations: ['loc-001'],
        region: 'Test Region',
        sceneType: 'Première rencontre',
        instructions: 'Updated instructions',
      };

      (usePresetStore as unknown as Mock).mockReturnValue({
        presets: [mockPreset],
        selectedPreset: mockPreset,
        isLoading: false,
        error: null,
        loadPresets: mockLoadPresets,
        createPreset: mockCreatePreset,
        updatePreset: mockUpdatePreset,
        deletePreset: mockDeletePreset,
        setSelectedPreset: mockSetSelectedPreset,
      });

      render(
        <PresetSelector
          onPresetLoaded={mockOnPresetLoaded}
          currentConfiguration={mockCurrentConfiguration}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /^enregistrer$/i }));

      await waitFor(() => {
        expect(mockUpdatePreset).toHaveBeenCalledWith(mockPreset.id, {
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
        updatePreset: mockUpdatePreset,
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
        updatePreset: mockUpdatePreset,
        deletePreset: mockDeletePreset,
        setSelectedPreset: mockSetSelectedPreset,
      });

      render(<PresetSelector onPresetLoaded={mockOnPresetLoaded} />);

      expect(screen.getByText(/failed to load presets/i)).toBeInTheDocument();
    });
  });
});
