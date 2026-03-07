"""Health checks pour vérifier les dépendances de l'API."""
import os
import logging
import tempfile
from typing import Dict, Any, Optional
from pathlib import Path
from constants import FilePaths
from api.config.security_config import get_security_config

# Import ContextBuilder uniquement si nécessaire (évite les dépendances circulaires)
try:
    from context_builder import ContextBuilder, PROJECT_ROOT_DIR
except ImportError:
    ContextBuilder = None
    PROJECT_ROOT_DIR = None

logger = logging.getLogger(__name__)


class HealthCheckResult:
    """Résultat d'un health check individuel."""
    
    def __init__(self, name: str, status: str, message: Optional[str] = None, details: Optional[Dict[str, Any]] = None):
        """Initialise un résultat de health check.
        
        Args:
            name: Nom du check.
            status: Statut ("healthy", "degraded", "unhealthy").
            message: Message descriptif (optionnel).
            details: Détails supplémentaires (optionnel).
        """
        self.name = name
        self.status = status
        self.message = message
        self.details = details or {}
    
    def to_dict(self) -> Dict[str, Any]:
        """Convertit le résultat en dictionnaire.
        
        Returns:
            Dictionnaire représentant le résultat.
        """
        result = {
            "name": self.name,
            "status": self.status
        }
        if self.message:
            result["message"] = self.message
        if self.details:
            result["details"] = self.details
        return result


def _find_file_case_insensitive(directory: Path, filename: str) -> Optional[Path]:
    """Trouve un fichier dans un répertoire de manière case-insensitive.
    
    Args:
        directory: Répertoire dans lequel chercher.
        filename: Nom du fichier à chercher.
        
    Returns:
        Chemin vers le fichier trouvé, ou None si non trouvé.
    """
    if not directory.exists() or not directory.is_dir():
        return None
    
    filename_lower = filename.lower()
    for file_path in directory.iterdir():
        if file_path.is_file() and file_path.name.lower() == filename_lower:
            return file_path
    
    return None


def check_gdd_files() -> HealthCheckResult:
    """Vérifie que les fichiers GDD sont accessibles.
    
    Utilise les variables d'environnement GDD_CATEGORIES_PATH et GDD_IMPORT_PATH
    si définies, sinon utilise les chemins par défaut.
    
    Returns:
        HealthCheckResult avec le statut de vérification.
    """
    try:
        import os
        
        # Utiliser les variables d'environnement si définies, sinon les chemins par défaut
        env_categories_path = os.getenv("GDD_CATEGORIES_PATH")
        if env_categories_path:
            gdd_base_path = Path(env_categories_path)
        else:
            # Chemin par défaut : DialogueGenerator/data/GDD_categories
            project_root = Path(__file__).resolve().parent.parent.parent
            gdd_base_path = project_root / "data" / "GDD_categories"
        
        env_import_path = os.getenv("GDD_IMPORT_PATH")
        if env_import_path:
            import_base_path = Path(env_import_path)
            # Si le chemin pointe directement vers Vision.json, c'est bon
            if import_base_path.name.lower() == "vision.json":
                vision_file_path = import_base_path
            # Si le chemin pointe vers Bible_Narrative, chercher Vision.json dedans
            elif import_base_path.name == "Bible_Narrative":
                vision_file_path = import_base_path / "Vision.json"
            # Sinon, chercher Vision.json directement dans le répertoire (data/)
            else:
                vision_file_path = import_base_path / "Vision.json"
        else:
            # Chemin par défaut : data/Vision.json dans le projet
            project_root = Path(__file__).resolve().parent.parent.parent
            vision_file_path = project_root / "data" / "Vision.json"
            import_base_path = project_root / "data"
        
        # Vérifier que les répertoires existent
        issues = []
        
        if not gdd_base_path.exists():
            issues.append(f"Répertoire GDD non trouvé: {gdd_base_path}")
        elif not gdd_base_path.is_dir():
            issues.append(f"Chemin GDD n'est pas un répertoire: {gdd_base_path}")
        
        # Vérifier Vision.json (case-insensitive)
        vision_file_found = _find_file_case_insensitive(import_base_path, "Vision.json")
        if vision_file_found is None:
            issues.append(f"Fichier Vision.json non trouvé dans: {import_base_path}")
        else:
            vision_file_path = vision_file_found
        
        if issues:
            return HealthCheckResult(
                name="gdd_files",
                status="degraded",
                message="Certains répertoires GDD sont inaccessibles",
                details={"issues": issues, "gdd_path": str(gdd_base_path), "import_path": str(import_base_path)}
            )
        
        # Vérifier quelques fichiers clés (optionnel, car ils peuvent ne pas tous exister)
        # Recherche case-insensitive pour compatibilité Windows/Linux
        key_files = ["personnages.json", "lieux.json"]
        missing_files = []
        for key_file in key_files:
            file_path = _find_file_case_insensitive(gdd_base_path, key_file)
            if file_path is None:
                missing_files.append(key_file)
        
        if missing_files:
            return HealthCheckResult(
                name="gdd_files",
                status="degraded",
                message="Certains fichiers GDD clés manquants",
                details={"missing_files": missing_files, "note": "L'application peut fonctionner avec des fichiers partiels"}
            )
        
        return HealthCheckResult(
            name="gdd_files",
            status="healthy",
            message="Fichiers GDD accessibles",
            details={"gdd_path": str(gdd_base_path), "vision_path": str(vision_file_path)}
        )
    
    except Exception as e:
        logger.exception("Erreur lors de la vérification des fichiers GDD")
        return HealthCheckResult(
            name="gdd_files",
            status="unhealthy",
            message=f"Erreur lors de la vérification: {str(e)}",
            details={"error": str(e)}
        )


def check_storage() -> HealthCheckResult:
    """Vérifie que le répertoire de stockage des interactions est accessible en écriture.
    
    Returns:
        HealthCheckResult avec le statut de vérification.
    """
    try:
        project_root = Path(__file__).resolve().parents[2]
        storage_dir = project_root / FilePaths.INTERACTIONS_DIR
        
        # Vérifier que le répertoire existe
        if not storage_dir.exists():
            # Essayer de créer le répertoire
            try:
                storage_dir.mkdir(parents=True, exist_ok=True)
            except Exception as e:
                return HealthCheckResult(
                    name="storage",
                    status="unhealthy",
                    message=f"Impossible de créer le répertoire de stockage: {str(e)}",
                    details={"path": str(storage_dir), "error": str(e)}
                )
        
        if not storage_dir.is_dir():
            return HealthCheckResult(
                name="storage",
                status="unhealthy",
                message="Le chemin de stockage n'est pas un répertoire",
                details={"path": str(storage_dir)}
            )
        
        # Vérifier les permissions en écriture sans laisser de fichier résiduel.
        try:
            with tempfile.TemporaryFile(dir=storage_dir) as temporary_file:
                temporary_file.write(b"health-check")
                temporary_file.flush()
        except Exception as e:
            return HealthCheckResult(
                name="storage",
                status="unhealthy",
                message=f"Pas d'accès en écriture au répertoire de stockage: {str(e)}",
                details={"path": str(storage_dir), "error": str(e)}
            )
        
        return HealthCheckResult(
            name="storage",
            status="healthy",
            message="Répertoire de stockage accessible en écriture",
            details={"path": str(storage_dir)}
        )
    
    except Exception as e:
        logger.exception("Erreur lors de la vérification du stockage")
        return HealthCheckResult(
            name="storage",
            status="unhealthy",
            message=f"Erreur lors de la vérification: {str(e)}",
            details={"error": str(e)}
        )


def check_config() -> HealthCheckResult:
    """Vérifie que les configurations critiques sont chargées.
    
    Returns:
        HealthCheckResult avec le statut de vérification.
    """
    try:
        security_config = get_security_config()
        issues = []
        
        # Vérifier JWT_SECRET_KEY (si en production)
        if security_config.is_production and security_config.jwt_secret_key == "your-secret-key-change-in-production":
            issues.append("JWT_SECRET_KEY utilise la valeur par défaut en production")
        
        # Vérifier que la config est valide (sans logger de warnings répétés)
        # On vérifie seulement les erreurs critiques (production)
        if security_config.is_production and security_config.jwt_secret_key == "your-secret-key-change-in-production":
            issues.append("JWT_SECRET_KEY utilise la valeur par défaut en production")
        
        if issues:
            return HealthCheckResult(
                name="config",
                status="unhealthy" if security_config.is_production else "degraded",
                message="Problèmes de configuration détectés",
                details={"issues": issues}
            )
        
        return HealthCheckResult(
            name="config",
            status="healthy",
            message="Configuration valide",
            details={"environment": security_config.environment}
        )
    
    except Exception as e:
        logger.exception("Erreur lors de la vérification de la configuration")
        return HealthCheckResult(
            name="config",
            status="unhealthy",
            message=f"Erreur lors de la vérification: {str(e)}",
            details={"error": str(e)}
        )


def check_llm_connectivity() -> HealthCheckResult:
    """Vérifie la connectivité LLM (ping optionnel).
    
    Cette vérification peut être lente et est désactivable via HEALTH_CHECK_LLM_PING.
    
    Returns:
        HealthCheckResult avec le statut de vérification.
    """
    try:
        # Vérifier si le ping est activé
        llm_ping_enabled = os.getenv("HEALTH_CHECK_LLM_PING", "false").lower() in ("true", "1", "yes")
        
        if not llm_ping_enabled:
            return HealthCheckResult(
                name="llm_connectivity",
                status="healthy",
                message="Vérification LLM désactivée (ping non requis)",
                details={"ping_enabled": False}
            )
        
        # Vérifier que la clé API est configurée
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return HealthCheckResult(
                name="llm_connectivity",
                status="degraded",
                message="Clé API OpenAI non configurée",
                details={"note": "L'application utilisera DummyLLMClient"}
            )
        
        # Note: Un vrai ping nécessiterait un appel API, ce qui est coûteux
        # Pour l'instant, on vérifie juste que la clé est présente
        # Un ping réel pourrait être ajouté plus tard si nécessaire
        
        return HealthCheckResult(
            name="llm_connectivity",
            status="healthy",
            message="Clé API OpenAI configurée",
            details={"ping_enabled": True, "api_key_present": True}
        )
    
    except Exception as e:
        logger.exception("Erreur lors de la vérification de la connectivité LLM")
        return HealthCheckResult(
            name="llm_connectivity",
            status="degraded",
            message=f"Erreur lors de la vérification: {str(e)}",
            details={"error": str(e)}
        )


def perform_health_checks(detailed: bool = False) -> Dict[str, Any]:
    """Effectue tous les health checks.
    
    Args:
        detailed: Si True, effectue tous les checks détaillés. Si False, retourne juste le statut basique.
        
    Returns:
        Dictionnaire avec le statut global et les détails des checks.
    """
    checks = [
        check_config(),
        check_storage()
    ]
    
    if detailed:
        checks.extend([
            check_gdd_files(),
            check_llm_connectivity()
        ])
    
    # Déterminer le statut global
    statuses = [check.status for check in checks]
    if "unhealthy" in statuses:
        overall_status = "unhealthy"
    elif "degraded" in statuses:
        overall_status = "degraded"
    else:
        overall_status = "healthy"
    
    # Convertir les résultats en dictionnaires
    checks_dict = [check.to_dict() for check in checks]
    
    return {
        "status": overall_status,
        "checks": checks_dict,
        "timestamp": None  # Sera ajouté par l'endpoint
    }

