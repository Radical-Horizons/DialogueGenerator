import os
from pathlib import Path

# `constants.py` est à la racine du dépôt (ou du worktree) qui exécute le code.
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
    BENCHMARKS_DIR = DATA_DIR / "benchmarks"
    BENCHMARK_SUITES_DIR = BENCHMARKS_DIR / "suites"
    BENCHMARK_RUNS_DIR = BENCHMARKS_DIR / "runs"
    BENCHMARK_CRITERIA_DIR = BENCHMARKS_DIR / "criteria"
    LLM_CONFIG = "llm_config.json"

def resolve_benchmarks_dir() -> Path:
    """Retourne la racine des données de benchmark : suites, grilles et runs.

    ``BENCHMARK_DATA_DIR`` l'emporte. Sinon, et c'est tout l'intérêt de cette
    fonction, le dépôt **principal** est préféré au worktree depuis lequel le code
    tourne.

    Un banc existe pour comparer des runs **dans le temps** : un worktree est un
    détail de workflow, pas une frontière de données. Or ``data/benchmarks/`` est en
    ``.gitignore``, donc rien ne le suit, et un worktree supprimé emporte tout. C'est
    arrivé le 2026-10-01 : seize runs de septembre, dont trois mesures complètes
    facturées, ont disparu avec le leur. Les faire vivre dans le dépôt principal les
    rend partagés par tous les worktrees et survivants à chacun.

    Les identifiants de run portent un horodatage et un suffixe aléatoire : deux
    worktrees qui mesurent en parallèle écrivent côte à côte sans collision.

    Returns:
        Le répertoire racine des données de benchmark. Lu à chaque appel, pas à
        l'import : les tests le redéfinissent après coup.
    """
    override = os.getenv("BENCHMARK_DATA_DIR", "").strip()
    if override:
        return Path(override)
    return _main_checkout_root() / FilePaths.BENCHMARKS_DIR


def _main_checkout_root() -> Path:
    """Racine du dépôt principal, même appelée depuis un worktree.

    Dans un worktree, ``.git`` est un **fichier** qui pointe vers
    ``<principal>/.git/worktrees/<nom>``. Remonter de là donne le checkout
    principal sans lancer de sous-processus git.

    Returns:
        La racine principale, ou celle du code courant si rien ne permet de
        conclure — un dépôt ordinaire, une archive, un `.git` illisible.
    """
    git_path = _REPO_ROOT / ".git"
    try:
        if not git_path.is_file():
            return _REPO_ROOT
        pointer = git_path.read_text(encoding="utf-8").strip()
    except OSError:
        return _REPO_ROOT
    if not pointer.startswith("gitdir:"):
        return _REPO_ROOT
    git_dir = Path(pointer.split(":", 1)[1].strip())
    # <principal>/.git/worktrees/<nom> → <principal>
    for parent in git_dir.parents:
        if parent.name == ".git":
            return parent.parent
    return _REPO_ROOT


class ModelNames:
    """Noms des modèles OpenAI utilisés dans l'application.
    
    Source de vérité unique pour tous les identifiants de modèles.
    Utiliser ces constantes au lieu de strings codées en dur.

    Famille GPT-5.6 (doc OpenAI) : Sol = flagship, Terra = équilibre, Luna = volume/coût.
    """
    # GPT-5.6 — tiers durables, routés par OpenRouter comme tout le catalogue.
    #
    # Une seule route veut dire un seul client à régler, une seule source de
    # tarifs, une seule surface de paramètres. La double route coûtait cher :
    # `reasoning_effort` n'était câblé que côté OpenAI, si bien qu'au banc du
    # 2026-09-21 les modèles OpenAI tournaient à `medium` et les autres au défaut
    # de leur fournisseur — on comparait des réglages, pas des modèles.
    # Sol y gagne au passage : 2/10 par million via OpenRouter contre 5/30 en direct.
    GPT_5_6_SOL = "openai/gpt-5.6-sol"
    GPT_5_6_TERRA = "openai/gpt-5.6-terra"
    GPT_5_6_LUNA = "openai/gpt-5.6-luna"
    # Alias API OpenAI : gpt-5.6 → Sol
    GPT_5_6 = "openai/gpt-5.6"

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
    # OpenRouter — Mistral Medium 3.5 (structured outputs, temperature acceptée,
    # contexte 262k ; catalogue OpenRouter relevé le 2026-08-08)
    MISTRAL_MEDIUM_3_5 = "mistralai/mistral-medium-3-5"

    # Anciens slugs API → famille 5.6 (presets, localStorage, tests)
    LEGACY_MODEL_ID_MAP: dict[str, str] = {
        "gpt-5.4": GPT_5_6_SOL,
        "gpt-5.2": GPT_5_6_TERRA,
        "gpt-5.2-pro": GPT_5_6_SOL,
        "gpt-5.2-thinking": GPT_5_6_SOL,
        "gpt-5-mini": GPT_5_6_LUNA,
        "gpt-5-nano": GPT_5_6_LUNA,
        "gpt-5.6": GPT_5_6_SOL,
        # Bascule des trois tiers 5.6 sur OpenRouter (2026-09-21). Les presets,
        # le localStorage et les runs antérieurs portent encore les slugs nus.
        "gpt-5.6-sol": GPT_5_6_SOL,
        "gpt-5.6-terra": GPT_5_6_TERRA,
        "gpt-5.6-luna": GPT_5_6_LUNA,
        # `labs-mistral-small-creative` n'a jamais existé au catalogue Mistral
        # (53 modèles listés le 2026-08-08, aucun ne porte ce nom). Les presets et
        # le localStorage qui le portent encore migrent vers le modèle retenu.
        "labs-mistral-small-creative": MISTRAL_MEDIUM_3_5,
    }

    @classmethod
    def normalize_model_id(cls, model_id: str) -> str:
        """Mappe un identifiant legacy vers le slug GPT-5.6 courant."""
        return cls.LEGACY_MODEL_ID_MAP.get(model_id, model_id)
    
    # Liste des modèles qui nécessitent max_completion_tokens (au lieu de max_tokens)
    MODELS_USING_MAX_COMPLETION_TOKENS = [
        GPT_5_6_SOL, GPT_5_6_TERRA, GPT_5_6_LUNA, GPT_5_6,
    ]
    
    # GPT-5.6 par l'API OpenAI directe : temperature / top_p rejetés (400 Unsupported
    # parameter). Preuve runtime 2026-07-17. Contrôler la « créativité » via
    # reasoning.effort / text.verbosity, pas temperature ; omettre l'effort vaut medium.
    #
    # ⚠️ Cette liste ne protège **que** le chemin OpenAI : le garde-fou vit dans
    # `OpenAIParameterBuilder`, et `OpenRouterClient` envoie `temperature`
    # inconditionnellement. Depuis la bascule du catalogue entier sur OpenRouter
    # (2026-09-21), elle est donc inerte en pratique. Sondé le 2026-10-01, trois
    # appels par régime : via OpenRouter, Luna accepte `temperature` **sans erreur et
    # sans effet** (ni collapse à 0,0 ni dégât à 2,0), là où `z-ai/glm-5.3` rend
    # trois réponses vides à 2,0. Ne pas lire cette liste comme une garantie que
    # GPT-5.6 ne reçoit pas de température : il en reçoit une, elle ne fait rien.
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