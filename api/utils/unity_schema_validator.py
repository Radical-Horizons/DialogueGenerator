"""Validateur de schéma JSON Unity pour les dialogues.

Ce module charge et valide les exports Unity contre le schéma JSON Schema
fourni par Unity. Le schéma est chargé depuis docs/resources/ et n'est
disponible qu'en développement (pas en production).

v1.1.0 (Story 16.1) : document racine = objet { schemaVersion, nodes } ;
accepte aussi une liste (legacy) en la normalisant en document pour validation.
Si le schéma est absent, les fonctions retournent des valeurs par défaut
sans erreur (graceful degradation).
"""
import json
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple, Union

logger = logging.getLogger(__name__)

# Chemin relatif depuis la racine du projet
_SCHEMA_PATH = Path(__file__).parent.parent.parent / "docs" / "resources" / "dialogue-format.schema.json"

# Cache du schéma chargé
_schema_cache: Optional[Dict[str, Any]] = None


def load_unity_schema() -> Optional[Dict[str, Any]]:
    """Charge le schéma JSON Unity depuis le fichier.
    
    Returns:
        Le schéma JSON sous forme de dict, ou None si le fichier est absent.
        
    Note:
        Le schéma est mis en cache après le premier chargement.
    """
    global _schema_cache
    
    if _schema_cache is not None:
        return _schema_cache
    
    if not _SCHEMA_PATH.exists():
        logger.debug(f"Schéma Unity non trouvé à {_SCHEMA_PATH} (normal en production)")
        return None
    
    try:
        with open(_SCHEMA_PATH, 'r', encoding='utf-8') as f:
            _schema_cache = json.load(f)
        logger.info(f"Schéma Unity chargé depuis {_SCHEMA_PATH}")
        return _schema_cache
    except (json.JSONDecodeError, IOError) as e:
        logger.warning(f"Erreur lors du chargement du schéma Unity: {e}")
        return None


def _normalize_to_document(data: Union[List[Dict[str, Any]], Dict[str, Any]]) -> Dict[str, Any]:
    """Normalise l'entrée en document v1.1.0 (objet avec schemaVersion et nodes).
    
    - Si dict avec clé 'nodes' : retourne tel quel (doit contenir schemaVersion pour être valide).
    - Si list : enveloppe en { schemaVersion: "1.1.0", nodes: data } pour validation (legacy).
    - Sinon : lève ValueError (malformed input).
    """
    if isinstance(data, dict) and "nodes" in data:
        return data
    if isinstance(data, list):
        return {"schemaVersion": "1.1.0", "nodes": data}
    # Dict sans 'nodes' ou type invalide
    logger.warning(f"_normalize_to_document: input malformed (type={type(data).__name__}, keys={data.keys() if isinstance(data, dict) else 'N/A'})")
    raise ValueError("Invalid document format: expected dict with 'nodes' key or list of nodes")


def validate_unity_json(json_data: Union[List[Dict[str, Any]], Dict[str, Any]]) -> Tuple[bool, List[str]]:
    """Valide un JSON Unity contre le schéma.
    
    Accepte un document v1.1.0 (dict avec schemaVersion et nodes) ou une liste
    de nœuds (legacy), normalisée en document pour validation.
    
    Args:
        json_data: Document (dict avec schemaVersion, nodes) ou liste de nœuds (legacy).
        
    Returns:
        Tuple (is_valid, errors) où errors est la liste des messages d'erreur.
        Si le schéma est absent, retourne (True, []) (graceful degradation).
    """
    schema = load_unity_schema()
    
    if schema is None:
        # Schéma absent : pas d'erreur, juste pas de validation
        return (True, [])
    
    # Normalisation : document v1.1.0 uniquement (pas de rétrocompat v1.0)
    payload = _normalize_to_document(json_data)
    
    try:
        import jsonschema
        from jsonschema import ValidationError
        
        validator = jsonschema.Draft7Validator(schema)
        errors = []
        
        for error in validator.iter_errors(payload):
            # Formater l'erreur de manière lisible
            path = " -> ".join(str(p) for p in error.path)
            error_msg = f"{error.message}"
            if path:
                error_msg = f"[{path}] {error_msg}"
            errors.append(error_msg)
        
        is_valid = len(errors) == 0
        
        if not is_valid:
            logger.warning(f"Validation Unity échouée: {len(errors)} erreur(s)")
            for err in errors[:5]:  # Logger les 5 premières erreurs
                logger.warning(f"  - {err}")
        
        return (is_valid, errors)
        
    except ImportError:
        logger.warning("jsonschema non installé, validation Unity désactivée")
        return (True, [])
    except Exception as e:
        logger.error(f"Erreur lors de la validation Unity: {e}")
        return (False, [f"Erreur de validation: {str(e)}"])


def _error_to_structured(error: Any) -> Dict[str, Any]:
    """Convertit une erreur jsonschema en dict structuré (code, message, path)."""
    path_dot = ".".join(str(p) for p in error.path) if error.path else ""
    msg = getattr(error, "message", str(error))
    code = "missing_choice_id" if "choiceId" in msg and "required" in msg.lower() else "validation_error"
    return {"code": code, "message": msg, "path": path_dot}


def validate_unity_json_structured(
    json_data: Union[List[Dict[str, Any]], Dict[str, Any]]
) -> Tuple[bool, List[Dict[str, Any]]]:
    """Valide un JSON Unity et retourne des erreurs structurées (code, message, path).
    
    Pour schemaVersion >= 1.1.0, un document sans choiceId dans un choice produit
    une erreur avec code "missing_choice_id". Connecté à l'endpoint PUT document
    (Story 16.2) en mode export (validation bloquante).
    
    Args:
        json_data: Document (dict avec schemaVersion, nodes) ou liste de nœuds (legacy).
        
    Returns:
        Tuple (is_valid, errors_structured) où errors_structured est une liste de
        dicts avec clés "code", "message", "path". Si schéma absent, (True, []).
    """
    schema = load_unity_schema()
    if schema is None:
        return (True, [])
    
    # Normalisation : document v1.1.0 uniquement (pas de rétrocompat v1.0)
    payload = _normalize_to_document(json_data)
    
    try:
        import jsonschema
        validator = jsonschema.Draft7Validator(schema)
        errors_structured: List[Dict[str, Any]] = []
        for error in validator.iter_errors(payload):
            errors_structured.append(_error_to_structured(error))
        is_valid = len(errors_structured) == 0
        return (is_valid, errors_structured)
    except ImportError:
        logger.warning("jsonschema non installé, validation Unity désactivée")
        return (True, [])
    except Exception as e:
        logger.error(f"Erreur lors de la validation Unity: {e}")
        return (False, [{"code": "validation_error", "message": str(e), "path": ""}])


def schema_exists() -> bool:
    """Vérifie si le schéma Unity est disponible.

    Returns:
        True si le fichier de schéma existe, False sinon.
    """
    return _SCHEMA_PATH.exists()
