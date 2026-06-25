"""Formatage des erreurs jsonschema en messages utilisateur français (Story 5.3 / FR51)."""
from __future__ import annotations

import re
from typing import Any, Dict, Optional

TEST_FIELD_PATTERN = re.compile(r"^[^\s:+]+\+[^\s:+]+:\d+$")


def is_test_field_path(path: str) -> bool:
    """Indique si le chemin JSON pointe vers un champ ``test`` (nœud ou choix)."""
    if not path:
        return False
    return path == "test" or path.endswith(".test")


def format_test_pattern_error(instance: Any) -> str:
    """Message actionnable pour un champ ``test`` hors format Unity.

    Args:
        instance: Valeur reçue (ex. ``Raison+Déplacement silencieux:9``).

    Returns:
        Message utilisateur en français, sans regex technique.
    """
    value = str(instance).strip() if instance is not None else ""
    base = (
        "Format attendu : Attribut+Compétence:DD (ex. Raison+Rhétorique:8). "
        "L'attribut et la compétence ne doivent contenir ni espace, ni « : », ni « + »."
    )
    if not value:
        return base

    before_dd, _, dd_part = value.partition(":")
    if not dd_part.isdigit():
        return (
            f"{base} Valeur reçue : « {value} » — le DD après « : » doit être un nombre entier."
        )

    if "+" not in before_dd:
        return (
            f"{base} Valeur reçue : « {value} » — il manque le « + » entre attribut et compétence."
        )

    attribute, _, skill = before_dd.partition("+")
    if not attribute or not skill:
        return f"{base} Valeur reçue : « {value} »."

    if " " in attribute or " " in skill:
        spaced = attribute if " " in attribute else skill
        return (
            f"{base} Valeur reçue : « {value} » — « {spaced} » contient un espace ; "
            "utilisez le nom exact de la compétence (sans espace), tel que dans le GDD."
        )

    return f"{base} Valeur reçue : « {value} »."


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

    if validator == "pattern" and is_test_field_path(path):
        return f"Erreur schéma Unity : champ '{field}' — {format_test_pattern_error(getattr(error, 'instance', None))}"

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

    if code == "schema_pattern_test":
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
