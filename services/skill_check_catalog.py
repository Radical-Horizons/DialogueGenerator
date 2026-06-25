"""Catalogue caractéristiques + compétences pour tests Unity et prompts LLM."""
from __future__ import annotations

import csv
import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger(__name__)

# 8 caractéristiques canoniques (GDD Caractéristiques & Compétences / Core System).
CORE_ATTRIBUTE_ENTRIES: tuple[tuple[str, str], ...] = (
    ("Puissance", "Puissance"),
    ("Agilité", "Agilité"),
    ("Perception", "Perception"),
    ("Intelligence", "Intelligence"),
    ("Créativité", "Créativité"),
    ("Sociabilité", "Sociabilité"),
    ("Technique", "Technique"),
    ("Volonté", "Volonté"),
)

_ATTRIBUTE_IDS_FOR_PROMPT: List[str] = [entry_id for entry_id, _ in CORE_ATTRIBUTE_ENTRIES]

_FORBIDDEN_TOKEN_CHARS = re.compile(r"[\s:+]+")


@dataclass(frozen=True)
class SkillCheckCatalogEntry:
    """Entrée catalogue : identifiant Unity (sans espace) + libellé affiché."""

    id: str
    label: str


def unity_token_from_label(label: str, export_id: str = "") -> str:
    """Dérive l'identifiant Unity d'un libellé (sans espaces ni séparateurs test).

    Args:
        label: Libellé CSV ou saisi.
        export_id: Valeur colonne « ID export » si présente.

    Returns:
        Token utilisable dans ``Attribut+Compétence:DD``.
    """
    cleaned_export = (export_id or "").strip()
    if cleaned_export:
        return cleaned_export
    compact = "".join(label.split())
    if not compact:
        return ""
    if _FORBIDDEN_TOKEN_CHARS.search(compact):
        compact = _FORBIDDEN_TOKEN_CHARS.sub("", compact)
    return compact


def load_attribute_entries() -> List[SkillCheckCatalogEntry]:
    """Retourne les 8 caractéristiques fondamentales."""
    return [SkillCheckCatalogEntry(id=entry_id, label=label) for entry_id, label in CORE_ATTRIBUTE_ENTRIES]


def load_skill_entries(csv_path: Optional[Path] = None) -> List[SkillCheckCatalogEntry]:
    """Charge les compétences depuis SkillCatalog.csv avec identifiants Unity.

    Args:
        csv_path: Chemin CSV ; défaut ``data/UnityData/SkillCatalog.csv``.

    Returns:
        Liste triée par label, dédupliquée par ``id``.
    """
    if csv_path is None:
        project_root = Path(__file__).resolve().parent.parent
        csv_path = project_root / "data" / "UnityData" / "SkillCatalog.csv"

    if not csv_path.exists():
        logger.warning("SkillCatalog.csv introuvable: %s", csv_path)
        return []

    entries: dict[str, SkillCheckCatalogEntry] = {}
    try:
        with csv_path.open("r", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            if not reader.fieldnames or "Compétence" not in reader.fieldnames:
                logger.warning("Colonne Compétence absente dans %s", csv_path)
                return []
            for row in reader:
                label = (row.get("Compétence") or "").strip()
                if not label:
                    continue
                export_id = (row.get("ID export") or "").strip()
                token = unity_token_from_label(label, export_id)
                if not token:
                    continue
                entries[token] = SkillCheckCatalogEntry(id=token, label=label)
    except csv.Error as exc:
        logger.error("Erreur parsing SkillCatalog.csv: %s", exc)
        return []

    return sorted(entries.values(), key=lambda item: item.label.lower())


def load_skill_ids_for_prompt(csv_path: Optional[Path] = None) -> List[str]:
    """Identifiants compétences pour injection prompt (sans espaces)."""
    return [entry.id for entry in load_skill_entries(csv_path)]


def load_attribute_ids_for_prompt() -> List[str]:
    """Identifiants caractéristiques pour injection prompt."""
    return _ATTRIBUTE_IDS_FOR_PROMPT
