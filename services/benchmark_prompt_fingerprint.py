"""Empreinte de la consigne de génération d'un run.

Deux runs ne mesurent la même chose que s'ils ont envoyé la même consigne. Or
rien ne le disait : l'identité d'un run couvre la suite, les modèles, l'effort et
le mode de narration, mais pas le prompt. Une réécriture du message système ou des
instructions de génération produisait donc des runs qui s'affichaient côte à côte
comme comparables — exactement ce qu'une campagne d'amélioration du prompt doit
pouvoir distinguer.

L'empreinte se calcule **après coup, sur ce qui a réellement été envoyé** : le
message système relevé sur le client, le schéma de sortie de l'outil, et le
`prompt_hash` de chaque cas. Une constante de version qu'on oublierait d'incrémenter
mentirait ; ce qui a été envoyé ne ment pas.
"""

from __future__ import annotations

import hashlib
import json
from typing import Iterable, Optional

from api.schemas.benchmark import BenchmarkGenerationRecord
from models.dialogue_structure.unity_dialogue_fragment import UnityDialogueFragmentResponse


def _sha256(text: str) -> str:
    """Retourne le condensé SHA-256 hexadécimal d'un texte."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def fragment_tool_schema_text() -> str:
    """Retourne le schéma JSON de la sortie attendue, tel que l'outil le transmet.

    Ses descriptions de champs sont lues par le modèle : c'est du prompt, au même
    titre que le texte XML. L'audit et l'empreinte le lisent donc aussi.

    Returns:
        Le schéma sérialisé de façon déterministe.
    """
    return json.dumps(
        UnityDialogueFragmentResponse.model_json_schema(),
        ensure_ascii=False,
        sort_keys=True,
    )


def generation_prompt_fingerprint(
    records: Iterable[BenchmarkGenerationRecord],
) -> Optional[str]:
    """Calcule l'empreinte de la consigne envoyée pendant un run.

    Args:
        records: Générations du run, toutes issues comprises.

    Returns:
        Douze caractères hexadécimaux, ou ``None`` si aucune génération ne porte
        de prompt — un run sans appel n'a rien envoyé.
    """
    parts = sorted(
        {
            f"{record.case_id}|{record.prompt_hash}|{_sha256(record.system_prompt or '')}"
            for record in records
            if record.prompt_hash
        }
    )
    if not parts:
        return None
    material = _sha256(fragment_tool_schema_text()) + "\n" + "\n".join(parts)
    return _sha256(material)[:12]
