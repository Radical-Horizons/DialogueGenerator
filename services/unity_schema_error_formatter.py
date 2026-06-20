"""Formatage des erreurs jsonschema en messages utilisateur français (Story 5.3 / FR51)."""
from __future__ import annotations

from typing import Any, Dict, Optional


def _field_label_from_path(path: str) -> str:
    """Extrait un libellé de champ lisible depuis un chemin JSON dot."""
    if not path:
        return "document"
    parts = path.split(".")
    return parts[-1] if parts else path


def format_jsonschema_error_to_french(error: Any) -> str:
    """Convertit une erreur jsonschema en message utilisateur français.

    Args:
        error: Instance ``ValidationError`` jsonschema ou dict structuré.

    Returns:
        Message du type « Erreur schéma Unity : champ 'X' … ».
    """
    validator = getattr(error, "validator", None)
    path = ".".join(str(p) for p in getattr(error, "path", []))
    field = _field_label_from_path(path)
    raw_message = getattr(error, "message", str(error))

    if validator == "type":
        expected = _schema_type_label(getattr(error, "schema", {}))
        received = type(getattr(error, "instance", None)).__name__
        return (
            f"Erreur schéma Unity : champ '{field}' a type incorrect "
            f"(attendu {expected}, reçu {received})"
        )

    if validator == "required":
        missing = _missing_property(error)
        if missing:
            return f"Erreur schéma Unity : champ requis '{missing}' manquant"
        return f"Erreur schéma Unity : {raw_message}"

    if "choiceId" in raw_message and "required" in raw_message.lower():
        return f"Erreur schéma Unity : champ requis 'choiceId' manquant ({path or 'choices'})"

    if path:
        return f"Erreur schéma Unity : [{path}] {raw_message}"
    return f"Erreur schéma Unity : {raw_message}"


def format_structured_error_to_french(structured: Dict[str, Any]) -> str:
    """Formate une erreur structurée (code/message/path) en message utilisateur.

    Args:
        structured: Dict avec clés ``code``, ``message``, ``path`` optionnelles.

    Returns:
        Message utilisateur en français.
    """
    code = str(structured.get("code") or "")
    message = str(structured.get("message") or "")
    path = str(structured.get("path") or "")

    if code == "reputation_palier_runtime_only":
        return message

    if code == "missing_choice_id":
        loc = path or "choices"
        return f"Erreur schéma Unity : champ requis 'choiceId' manquant ({loc})"

    if code == "schema_type_mismatch":
        return message

    if message.startswith("Erreur schéma Unity"):
        return message

    field = _field_label_from_path(path)
    if path:
        return f"Erreur schéma Unity : champ '{field}' — {message}"
    return f"Erreur schéma Unity : {message}"


def _schema_type_label(schema_fragment: Any) -> str:
    """Libellé humain du type attendu dans le schéma."""
    if isinstance(schema_fragment, dict):
        t = schema_fragment.get("type")
        if isinstance(t, list):
            return " ou ".join(str(x) for x in t)
        if t:
            return str(t)
    return "valide"


def _missing_property(error: Any) -> Optional[str]:
    """Retourne le nom de la propriété manquante si disponible."""
    validator_value = getattr(error, "validator_value", None)
    if isinstance(validator_value, (list, tuple)) and validator_value:
        return str(validator_value[0])
    message = getattr(error, "message", "")
    if "'" in message:
        parts = message.split("'")
        if len(parts) >= 2:
            return parts[1]
    return None
