from pathlib import Path

class UIText:
    NONE = "(Aucun)"
    NONE_FEM = "(Aucune)"
    ALL = "(Tous / Non spécifié)"
    NO_SELECTION = "(Sélectionner une région d'abord)"
    NONE_SUBLOCATION = "(Aucun sous-lieu)"
    LOADING = "Chargement..."
    ERROR_PREFIX = "Erreur: "
    NO_INTERACTION_FOUND = "Aucune interaction trouvée."
    NO_PATH_FOUND = "Aucun chemin trouvé pour l'interaction {interaction_id}."
    NO_VARIANT = "Aucune variante n'a été générée par le LLM ou une erreur s'est produite."
    NO_MODEL_CONFIGURED = "Aucun modèle configuré"
    CONTEXT_BUILDER_NOT_AVAILABLE = "(ContextBuilder non disponible)"
    UNKNOWN_ITEM_ERROR = "(Erreur - Nom d'item inconnu)"
    UNITY_DIALOGUES_PATH_NOT_CONFIGURED = "Chemin des dialogues Unity non configuré."
    NO_JSON_FILES_FOUND = "(Aucun fichier JSON trouvé)"
    NO_ITEMS_CATEGORY_OR_FILTER = "(Aucun item pour cette catégorie ou filtre)"
    NO_MATCHING_JSON_FILES = "(Aucun fichier JSON correspondant)"
    NO_ITEMS = "(Aucun item)"

class FilePaths:
    CONFIG_DIR = Path("config")
    DATA_DIR = Path("data")
    APP_DATABASE = DATA_DIR / "app.db"
    INTERACTIONS_DIR = DATA_DIR / "interactions"
    LLM_USAGE_DIR = DATA_DIR / "llm_usage"
    COST_BUDGETS_FILE = DATA_DIR / "cost_budgets.json"
    CONTEXT_RULES_FILE = DATA_DIR / "context-rules" / "rules.json"
    CONTEXT_DROPPING_RULES_FILE = DATA_DIR / "validation-rules" / "context-dropping.json"
    GDD_NOTION_SYNC_DIR = DATA_DIR / "gdd_notion_sync"
    GDD_NOTION_SYNC_CONFIG_FILE = GDD_NOTION_SYNC_DIR / "settings.json"
    GDD_NOTION_SYNC_TOKEN_FILE = GDD_NOTION_SYNC_DIR / "notion_token.secret"
    GDD_NOTION_SYNC_MANIFEST_FILE = DATA_DIR / ".gdd_snapshot" / "manifest.json"
    GDD_NOTION_FULL_SYNC_CHECKPOINT_FILE = GDD_NOTION_SYNC_DIR / "full_sync_checkpoint.json"
    GDD_NOTION_FULL_SYNC_CHECKPOINT_MANIFEST_FILE = (
        GDD_NOTION_SYNC_DIR / "full_sync_checkpoint.manifest.json"
    )
    LOGS_DIR = DATA_DIR / "logs"
    BENCHMARKS_DIR = DATA_DIR / "benchmarks"
    BENCHMARK_SUITES_DIR = BENCHMARKS_DIR / "suites"
    BENCHMARK_RUNS_DIR = BENCHMARKS_DIR / "runs"
    BENCHMARK_CRITERIA_DIR = BENCHMARKS_DIR / "criteria"
    LLM_CONFIG = "llm_config.json"

class ModelNames:
    """Noms des modèles OpenAI utilisés dans l'application.
    
    Source de vérité unique pour tous les identifiants de modèles.
    Utiliser ces constantes au lieu de strings codées en dur.

    Famille GPT-5.6 (doc OpenAI) : Sol = flagship, Terra = équilibre, Luna = volume/coût.
    """
    # GPT-5.6 — tiers durables (developers.openai.com/api/docs/models/gpt-5.6-*)
    GPT_5_6_SOL = "gpt-5.6-sol"
    GPT_5_6_TERRA = "gpt-5.6-terra"
    GPT_5_6_LUNA = "gpt-5.6-luna"
    # Alias API OpenAI : gpt-5.6 → Sol
    GPT_5_6 = "gpt-5.6"

    # Alias de code (mêmes valeurs que les slugs 5.6) — préférer GPT_5_6_*
    GPT_5_4 = GPT_5_6_SOL
    GPT_5_2 = GPT_5_6_TERRA
    GPT_5_2_PRO = GPT_5_6_SOL
    GPT_5_2_THINKING = GPT_5_6_SOL
    GPT_5_MINI = GPT_5_6_LUNA
    GPT_5_NANO = GPT_5_6_LUNA
    
    # Modèles obsolètes (pour référence)
    GPT_4_TURBO = "gpt-4-turbo"
    GPT_3_5_TURBO = "gpt-3.5-turbo"
    
    # Modèle de test
    DUMMY = "dummy"

    # OpenRouter — seed Aion 2.0
    AION_2_0 = "aion-labs/aion-2.0"

    # Anciens slugs API → famille 5.6 (presets, localStorage, tests)
    LEGACY_MODEL_ID_MAP: dict[str, str] = {
        "gpt-5.4": GPT_5_6_SOL,
        "gpt-5.2": GPT_5_6_TERRA,
        "gpt-5.2-pro": GPT_5_6_SOL,
        "gpt-5.2-thinking": GPT_5_6_SOL,
        "gpt-5-mini": GPT_5_6_LUNA,
        "gpt-5-nano": GPT_5_6_LUNA,
        "gpt-5.6": GPT_5_6_SOL,
    }

    @classmethod
    def normalize_model_id(cls, model_id: str) -> str:
        """Mappe un identifiant legacy vers le slug GPT-5.6 courant."""
        return cls.LEGACY_MODEL_ID_MAP.get(model_id, model_id)
    
    # Liste des modèles qui nécessitent max_completion_tokens (au lieu de max_tokens)
    MODELS_USING_MAX_COMPLETION_TOKENS = [
        GPT_5_6_SOL, GPT_5_6_TERRA, GPT_5_6_LUNA, GPT_5_6,
    ]
    
    # GPT-5.6 Responses API : temperature / top_p rejetés (400 Unsupported parameter).
    # Preuve runtime 2026-07-17 + doc : omit effort → défaut medium.
    # Contrôler la « créativité » via reasoning.effort / text.verbosity, pas temperature.
    MODELS_WITHOUT_CUSTOM_TEMPERATURE = [
        GPT_5_6_SOL, GPT_5_6_TERRA, GPT_5_6_LUNA, GPT_5_6,
    ]
    
    # Tous les tiers 5.6 supportent structured outputs (doc officielle)
    MODELS_WITH_STRUCTURED_OUTPUT_ISSUES: list[str] = []

    UNITY_STRUCTURED_OUTPUT_MODELS = (
        GPT_5_6_SOL,
        GPT_5_6_TERRA,
        GPT_5_6_LUNA,
    )

    @classmethod
    def is_gpt_5_6_family(cls, model_name: str) -> bool:
        """True si le slug appartient à la famille GPT-5.6 (Sol/Terra/Luna/alias)."""
        normalized = cls.normalize_model_id(model_name).lower()
        return "gpt-5.6" in normalized or normalized in {
            cls.GPT_5_6_SOL,
            cls.GPT_5_6_TERRA,
            cls.GPT_5_6_LUNA,
            cls.GPT_5_6,
        }

class PlayableCharacters:
    """PJ jouables Alteir — source de vérité partagée backend/frontend."""

    URESAIR = "Uresaïr"
    ETHEEREE = "L'Éthérée"
    VETHRAAK = "Vethraak"
    EONUNDE = "Eonundé Alinen-Egan"
    NAMES: tuple[str, ...] = (URESAIR, ETHEEREE, VETHRAAK, EONUNDE)
    DEFAULT_PLAYER = ETHEEREE


class Defaults:
    CONTEXT_TOKENS = 10000  # Plancher produit aligné MIN_CONTEXT_TOKENS (contexte LLM utilisable)
    VARIANTS_COUNT = 2
    TEMPERATURE = 0.7
    MODEL_ID = ModelNames.GPT_5_6_LUNA  # Défaut économique (volume / expand-tree)
    MAX_TOKENS_FOR_CONTEXT_BUILDING = 32000
    SAVE_SETTINGS_DELAY_MS = 1000
    MAIN_SPLITTER_STRETCH_FACTOR_LEFT_PANEL = 1
    MAIN_SPLITTER_STRETCH_FACTOR_GENERATION_PANEL = 3
    MAX_TOKENS_MODEL = 32000  # Recommandation OpenAI: 25000+ tokens pour reasoning summary
    INTERACTION_AUTOSAVE_INTERVAL_MS = 300000 # 5 minutes (nouvelle constante)
    # Limites pour les tokens de contexte (utilisées par l'API et le frontend)
    MAX_CONTEXT_TOKENS = 300000  # Maximum autorisé pour max_context_tokens
    MIN_CONTEXT_TOKENS = 10000  # Plancher sérieux contexte LLM + budget FR20 (Pydantic ge=, UI slider min)
    # Plafond API max_completion_tokens (aligné capacités modèles GPT-5.x ~128k ; UI slider peut être plus bas)
    MAX_COMPLETION_TOKENS = 128000
    # Valeur par défaut pour max_completion_tokens (quand None)
    DEFAULT_MAX_COMPLETION_TOKENS = 5000  # Valeur par défaut pour la génération de dialogues
    # Plafond mensuel par défaut (USD) pour un utilisateur sans entrée dans cost_budgets.json (0 = illimité si défini explicitement)
    DEFAULT_MONTHLY_LLM_QUOTA_USD = 10.0
    # Plafond batch export / download / preview Unity (FR50–FR53)
    UNITY_EXPORT_BATCH_MAX_ITEMS = 64

class ConfigFiles:
    pass  # Placeholder for future config file constants if needed 