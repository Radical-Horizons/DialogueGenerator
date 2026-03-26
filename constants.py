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
    INTERACTIONS_DIR = DATA_DIR / "interactions"
    LLM_USAGE_DIR = DATA_DIR / "llm_usage"
    COST_BUDGETS_FILE = DATA_DIR / "cost_budgets.json"
    CONTEXT_RULES_FILE = DATA_DIR / "context-rules" / "rules.json"
    GDD_NOTION_SYNC_DIR = DATA_DIR / "gdd_notion_sync"
    GDD_NOTION_SYNC_CONFIG_FILE = GDD_NOTION_SYNC_DIR / "settings.json"
    GDD_NOTION_SYNC_TOKEN_FILE = GDD_NOTION_SYNC_DIR / "notion_token.secret"
    GDD_NOTION_SYNC_MANIFEST_FILE = DATA_DIR / ".gdd_snapshot" / "manifest.json"
    LOGS_DIR = DATA_DIR / "logs"
    LLM_CONFIG = "llm_config.json"

class ModelNames:
    """Noms des modèles OpenAI utilisés dans l'application.
    
    Source de vérité unique pour tous les identifiants de modèles.
    Utiliser ces constantes au lieu de strings codées en dur.
    """
    # Modèles GPT-5.2
    GPT_5_2 = "gpt-5.2"
    GPT_5_2_PRO = "gpt-5.2-pro"
    # Alias pour compatibilité (déprécié, utiliser GPT_5_2_PRO)
    GPT_5_2_THINKING = "gpt-5.2-pro"
    
    # Modèles GPT-5 (versions allégées)
    GPT_5_MINI = "gpt-5-mini"
    GPT_5_NANO = "gpt-5-nano"
    
    # Modèles obsolètes (pour référence)
    GPT_4_TURBO = "gpt-4-turbo"
    GPT_3_5_TURBO = "gpt-3.5-turbo"
    
    # Modèle de test
    DUMMY = "dummy"
    
    # Liste des modèles qui nécessitent max_completion_tokens (au lieu de max_tokens)
    MODELS_USING_MAX_COMPLETION_TOKENS = [GPT_5_2, GPT_5_2_PRO, GPT_5_2_THINKING, GPT_5_MINI, GPT_5_NANO]
    
    # Liste des modèles qui ne supportent pas la température personnalisée
    MODELS_WITHOUT_CUSTOM_TEMPERATURE = [GPT_5_MINI, GPT_5_NANO]
    
    # Liste des modèles qui peuvent avoir des problèmes avec le structured output
    MODELS_WITH_STRUCTURED_OUTPUT_ISSUES = [GPT_5_MINI, GPT_5_NANO]

class Defaults:
    CONTEXT_TOKENS = 1500
    VARIANTS_COUNT = 2
    TEMPERATURE = 0.7
    MODEL_ID = ModelNames.GPT_5_MINI  # Modèle par défaut
    MAX_TOKENS_FOR_CONTEXT_BUILDING = 32000
    SAVE_SETTINGS_DELAY_MS = 1000
    MAIN_SPLITTER_STRETCH_FACTOR_LEFT_PANEL = 1
    MAIN_SPLITTER_STRETCH_FACTOR_GENERATION_PANEL = 3
    MAX_TOKENS_MODEL = 32000  # Recommandation OpenAI: 25000+ tokens pour reasoning summary
    INTERACTION_AUTOSAVE_INTERVAL_MS = 300000 # 5 minutes (nouvelle constante)
    # Limites pour les tokens de contexte (utilisées par l'API et le frontend)
    MAX_CONTEXT_TOKENS = 100000  # Maximum autorisé pour max_context_tokens
    MIN_CONTEXT_TOKENS = 10000   # Minimum pour le slider frontend
    # Valeur par défaut pour max_completion_tokens (quand None)
    DEFAULT_MAX_COMPLETION_TOKENS = 5000  # Valeur par défaut pour la génération de dialogues

class ConfigFiles:
    pass  # Placeholder for future config file constants if needed 