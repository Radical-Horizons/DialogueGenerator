import os
from pathlib import Path

# `constants.py` est à la racine du dépôt.
_REPO_ROOT = Path(__file__).resolve().parent

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
    LLM_CONFIG = "llm_config.json"


def resolve_logs_dir() -> Path:
    """Retourne le dossier des logs applicatifs : ``LOG_DIR`` s'il est défini, sinon ``<dépôt>/data/logs``.

    Seule résolution à utiliser, côté écrivains (handler JSON, journal sync Notion, logs
    export) comme côté lecteurs (``LogService``, nettoyage au démarrage) : un lecteur qui
    relirait ``FilePaths.LOGS_DIR`` en dur ne verrait plus rien dès que ``LOG_DIR`` est posé.
    Lue à chaque appel, pas à l'import : les tests changent ``LOG_DIR`` après coup.
    """
    override = os.getenv("LOG_DIR", "").strip()
    return Path(override) if override else _REPO_ROOT / FilePaths.LOGS_DIR

class ModelNames:
    """Noms des modèles LLM utilisés dans l'application.

    Source de vérité unique pour tous les identifiants de modèles.
    Utiliser ces constantes au lieu de strings codées en dur.

    Le code applicatif vise des **rôles** (``STANDARD``, ``MID``, ``ECONOMY``) plutôt qu'une
    génération : changer de famille ne touche que ce bloc, la config et les prix.
    Famille courante (doc OpenAI, 2026-11-19) : GPT-6.2 Sol (usage courant, le plus capable
    proposé), GPT-6.1 Terra (moins cher), GPT-6 Luna (volume / coût). GPT-6.2 Astra a été retiré
    du catalogue le 2026-11-19 (décision produit) : plus de rôle ``FLAGSHIP``.
    """
    # GPT-6.x — developers.openai.com/api/docs/models/{slug}
    GPT_6_2_SOL = "gpt-6.2-sol"
    GPT_6_1_TERRA = "gpt-6.1-terra"
    GPT_6_LUNA = "gpt-6-luna"

    STANDARD = GPT_6_2_SOL
    MID = GPT_6_1_TERRA
    ECONOMY = GPT_6_LUNA

    # GPT-5.6 — famille précédente, migrée vers les rôles ci-dessus (LEGACY_MODEL_ID_MAP)
    GPT_5_6_SOL = "gpt-5.6-sol"
    GPT_5_6_TERRA = "gpt-5.6-terra"
    GPT_5_6_LUNA = "gpt-5.6-luna"
    GPT_5_6 = "gpt-5.6"

    # Alias de code historiques — préférer les rôles
    GPT_5_4 = STANDARD
    GPT_5_2 = STANDARD
    GPT_5_2_PRO = STANDARD
    GPT_5_2_THINKING = STANDARD
    GPT_5_MINI = ECONOMY
    GPT_5_NANO = ECONOMY

    # Modèles obsolètes (pour référence)
    GPT_4_TURBO = "gpt-4-turbo"
    GPT_3_5_TURBO = "gpt-3.5-turbo"

    # Modèle de test
    DUMMY = "dummy"

    # OpenRouter — seed Aion 2.0
    AION_2_0 = "aion-labs/aion-2.0"

    # Mistral Large 4 (docs.mistral.ai/models/mistral-large-4-0) : hors catalogue tant que
    # l'abonnement Mistral ne le donne pas (403 « tier_not_allowed », 429 sur les autres, 2026-11-19).
    MISTRAL_LARGE_4 = "mistral-large-4"

    # Anciens slugs → rôle courant (presets, localStorage, réglages enregistrés, tests).
    # Par rôle, pas par nom : 5.6 Terra était le défaut équilibré, son successeur est 6.2 Sol.
    # Les anciens slugs « haut de gamme » retombent sur STANDARD depuis le retrait d'Astra.
    LEGACY_MODEL_ID_MAP: dict[str, str] = {
        "gpt-6.2-astra": STANDARD,
        "gpt-5.6-sol": STANDARD,
        "gpt-5.6": STANDARD,
        "gpt-5.6-terra": STANDARD,
        "gpt-5.6-luna": ECONOMY,
        "gpt-5.4": STANDARD,
        "gpt-5.2": STANDARD,
        "gpt-5.2-pro": STANDARD,
        "gpt-5.2-thinking": STANDARD,
        "gpt-5-mini": ECONOMY,
        "gpt-5-nano": ECONOMY,
        # Retiré par Mistral le 2026-04-30 ; pas de remplaçant accessible avec l'abonnement actuel
        "labs-mistral-small-creative": STANDARD,
    }

    @classmethod
    def normalize_model_id(cls, model_id: str) -> str:
        """Mappe un identifiant legacy vers le slug courant de même rôle."""
        return cls.LEGACY_MODEL_ID_MAP.get(model_id, model_id)

    CURRENT_OPENAI_MODELS: tuple[str, ...] = (GPT_6_2_SOL, GPT_6_1_TERRA, GPT_6_LUNA)

    # Liste des modèles qui nécessitent max_completion_tokens (au lieu de max_tokens)
    MODELS_USING_MAX_COMPLETION_TOKENS = [
        *CURRENT_OPENAI_MODELS, GPT_5_6_SOL, GPT_5_6_TERRA, GPT_5_6_LUNA, GPT_5_6,
    ]

    # temperature / top_p jamais envoyés : rejetés par GPT-5.6 (400, preuve runtime 2026-07-17),
    # à omettre pour GPT-6.x (guide latest-model, migration). Omettre l'effort → défaut medium.
    MODELS_WITHOUT_CUSTOM_TEMPERATURE = [
        *CURRENT_OPENAI_MODELS, GPT_5_6_SOL, GPT_5_6_TERRA, GPT_5_6_LUNA, GPT_5_6,
    ]

    # reasoning.effort « none » refusé (fiches modèles GPT-6.2) : ramené à « low ».
    MODELS_WITHOUT_REASONING_NONE: frozenset[str] = frozenset({GPT_6_2_SOL})

    # Point de coupure de cache explicite (``prompt_cache_breakpoint``). Voir
    # core/llm/openai/prompt_cache.py.
    MODELS_WITH_EXPLICIT_CACHE_BREAKPOINTS: frozenset[str] = frozenset(
        {*CURRENT_OPENAI_MODELS, GPT_5_6_SOL, GPT_5_6_TERRA, GPT_5_6_LUNA, GPT_5_6}
    )

    # Tous les modèles courants supportent structured outputs (fiches officielles)
    MODELS_WITH_STRUCTURED_OUTPUT_ISSUES: list[str] = []

    UNITY_STRUCTURED_OUTPUT_MODELS = CURRENT_OPENAI_MODELS

    @classmethod
    def is_reasoning_family(cls, model_name: str) -> bool:
        """True pour les familles à raisonnement sans temperature : GPT-5.6 et GPT-6.x."""
        normalized = cls.normalize_model_id(model_name).lower()
        return normalized.startswith(("gpt-5.6", "gpt-6"))

    @classmethod
    def is_gpt_5_6_family(cls, model_name: str) -> bool:
        """Ancien nom de :meth:`is_reasoning_family`, gardé pour les appels existants."""
        return cls.is_reasoning_family(model_name)

class PlayableCharacters:
    """PJ jouables Alteir — source de vérité partagée backend/frontend."""

    URESAIR = "Uresaïr"
    ETHEEREE = "L'Éthérée"
    VETHRAAK = "Vethraak"
    EONUNDE = "Eonundé Alinen-Egan"
    NAMES: tuple[str, ...] = (URESAIR, ETHEEREE, VETHRAAK, EONUNDE)
    DEFAULT_PLAYER = ETHEEREE


class Defaults:
    # Budget du bloc contexte GDD quand la requête n'en fixe pas (graphe, expand-tree, API).
    # 10 000 jusqu'au 2026-11-18 (on avait confondu défaut et plancher) : la fiche du PNJ
    # remplissait seule le budget. 40 000 = petit contexte pour les modèles actuels.
    CONTEXT_TOKENS = 40000
    VARIANTS_COUNT = 2
    TEMPERATURE = 0.7
    MODEL_ID = ModelNames.ECONOMY  # Défaut économique (volume / expand-tree)
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