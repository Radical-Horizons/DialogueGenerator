"""Construction des paires de générations à comparer, et parade aux biais de forme.

Logique pure, sans LLM ni disque : c'est ici que se décide *ce que* le juge voit,
et c'est donc ici que se jouent deux des trois contrôles de biais.

- **Biais d'identité** : les deux textes sont présentés sous les étiquettes ``A`` et
  ``B``. Quel modèle reçoit quelle étiquette est tiré d'une graine stable propre à
  la paire : reproductible d'une exécution à l'autre — sans quoi une reprise
  rejouerait une autre disposition — mais pas constante, pour que le juge ne puisse
  pas apprendre qu'une position correspond toujours au même candidat.
- **Biais de longueur** : les deux textes sont soumis à une même limite de longueur.
  Attention à ne pas surestimer cette parade — elle ne mord qu'au-delà de la limite,
  donc pas sur un fragment de dialogue ordinaire. Le vrai contre-poids au biais de
  longueur est double et vit ailleurs : la consigne explicite du prompt système
  (« à qualité égale, la plus concise vaut mieux ») et la longueur réelle enregistrée
  dans le verdict, que le rapport affiche **à côté** des résultats. La troncature ne
  fait que borner les cas extrêmes, où un modèle rend dix fois la consigne.

L'appariement se fait **par cas et par index de répétition**. Deux générations d'un
même cas et d'une même répétition partagent la graine de contexte, donc strictement
le même prompt : c'est la condition posée par la spécification pour qu'un duel ait
un sens.
"""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass
from itertools import combinations
from typing import Dict, List, Optional, Sequence, Tuple

from api.schemas.benchmark import BenchmarkGenerationRecord

logger = logging.getLogger(__name__)

PAIRWISE_TRUNCATION_CHARS = 4000
"""Limite commune appliquée aux deux textes d'un duel, en caractères."""

TRUNCATION_MARKER = "\n[…texte tronqué à la même limite pour les deux propositions…]"
"""Marque de coupure, visible du juge et annoncée dans le prompt."""


@dataclass(frozen=True)
class PairAssignment:
    """Une paire prête à être soumise au juge.

    Attributes:
        case_id: Cas commun aux deux générations.
        repetition: Index de répétition commun.
        model_a: Modèle présenté sous l'étiquette ``A``.
        model_b: Modèle présenté sous l'étiquette ``B``.
        text_a: Texte de ``A``, tronqué à la limite commune.
        text_b: Texte de ``B``, tronqué à la limite commune.
        length_a: Longueur réelle du texte de ``A``, avant troncature.
        length_b: Longueur réelle du texte de ``B``, avant troncature.
        truncated: ``True`` si au moins un des deux textes a été coupé.
        context: Prompt commun aux deux propositions. Les deux générations
            viennent du même cas, donc du même contexte : un seul bloc suffit,
            et il ne peut pas trahir laquelle est laquelle.
    """

    case_id: str
    repetition: int
    model_a: str
    model_b: str
    text_a: str
    text_b: str
    length_a: int
    length_b: int
    truncated: bool
    context: Optional[str] = None

    @property
    def models_sorted(self) -> Tuple[str, str]:
        """Couple de modèles trié — identité de la paire, indépendante des étiquettes."""
        return tuple(sorted((self.model_a, self.model_b)))  # type: ignore[return-value]


def pair_seed(
    run_id: str, case_id: str, model_x: str, model_y: str, repetition: int
) -> int:
    """Graine stable d'une paire, indépendante de l'ordre d'énumération.

    Les modèles sont triés avant hachage : la paire (A, B) et la paire (B, A)
    partagent la même graine, donc la même disposition — sans quoi la reprise
    pourrait inverser les étiquettes et produire un second fichier pour un duel
    déjà joué.

    Args:
        run_id: Run concerné.
        case_id: Cas concerné.
        model_x: Un des deux modèles.
        model_y: L'autre modèle.
        repetition: Index de répétition.

    Returns:
        Graine entière dérivée par SHA-256.
    """
    first, second = sorted((model_x, model_y))
    blob = f"{run_id}|{case_id}|{first}|{second}|{repetition}"
    return int(hashlib.sha256(blob.encode("utf-8")).hexdigest()[:8], 16)


def truncate_for_pairwise(
    text: str, limit: int = PAIRWISE_TRUNCATION_CHARS
) -> Tuple[str, bool]:
    """Tronque un texte à la limite commune.

    Args:
        text: Texte à tronquer.
        limit: Limite en caractères.

    Returns:
        Couple ``(texte, tronqué)``.
    """
    if len(text) <= limit:
        return text, False
    return text[:limit] + TRUNCATION_MARKER, True


def _generation_text(record: BenchmarkGenerationRecord) -> str:
    """Rend la génération telle qu'elle sera montrée au juge.

    Args:
        record: Génération.

    Returns:
        JSON Unity ré-indenté, ou le contenu brut s'il n'est pas décodable.
    """
    content = record.json_content or ""
    try:
        return json.dumps(json.loads(content), ensure_ascii=False, indent=2)
    except json.JSONDecodeError:
        return content


def build_pairs(
    records: Sequence[BenchmarkGenerationRecord],
    *,
    run_id: str,
    truncation_limit: int = PAIRWISE_TRUNCATION_CHARS,
) -> List[PairAssignment]:
    """Construit toutes les paires comparables d'un run.

    Args:
        records: Générations du run (seules les `valid` sont retenues).
        run_id: Run concerné, entrant dans la graine des étiquettes.
        truncation_limit: Limite commune de troncature.

    Returns:
        Paires triées par cas, répétition puis modèles — ordre déterministe, donc
        reprise stable.
    """
    by_slot: Dict[Tuple[str, int], Dict[str, BenchmarkGenerationRecord]] = {}
    for record in records:
        if record.status != "valid":
            continue
        # Une génération déclarée valide mais sans contenu ferait gagner son
        # adversaire dans les deux sens, sans mérite et sans que rien ne le signale.
        if not (record.json_content or "").strip():
            logger.warning(
                "Génération valide sans contenu écartée de l'appariement (%s / %s / %s)",
                record.model_id,
                record.case_id,
                record.repetition,
            )
            continue
        by_slot.setdefault((record.case_id, record.repetition), {})[record.model_id] = record

    pairs: List[PairAssignment] = []
    for (case_id, repetition) in sorted(by_slot):
        models = sorted(by_slot[(case_id, repetition)])
        for model_x, model_y in combinations(models, 2):
            seed = pair_seed(run_id, case_id, model_x, model_y, repetition)
            # Bit de poids faible : disposition tirée mais reproductible.
            swap = bool(seed & 1)
            first, second = (model_y, model_x) if swap else (model_x, model_y)

            record_first = by_slot[(case_id, repetition)][first]
            record_second = by_slot[(case_id, repetition)][second]
            raw_first = _generation_text(record_first)
            raw_second = _generation_text(record_second)
            text_first, cut_first = truncate_for_pairwise(raw_first, truncation_limit)
            text_second, cut_second = truncate_for_pairwise(raw_second, truncation_limit)

            # Le contexte n'est transmis que si les deux propositions ont reçu
            # strictement le même prompt. S'il diffère, il désignerait implicitement
            # l'une des deux — et le duel se jouerait sur autre chose que le texte.
            context = record_first.raw_prompt
            if context != record_second.raw_prompt:
                logger.warning(
                    "Prompts divergents sur %s / %s : contexte retiré du duel pour "
                    "ne pas trahir l'identité des propositions.",
                    case_id,
                    repetition,
                )
                context = None

            pairs.append(
                PairAssignment(
                    case_id=case_id,
                    repetition=repetition,
                    model_a=first,
                    model_b=second,
                    text_a=text_first,
                    text_b=text_second,
                    length_a=len(raw_first),
                    length_b=len(raw_second),
                    truncated=cut_first or cut_second,
                    context=context,
                )
            )
    return pairs


def count_unpairable_cases(records: Sequence[BenchmarkGenerationRecord]) -> int:
    """Compte les emplacements où un seul modèle a produit une génération valide.

    Un cas non appariable n'est pas une erreur, mais il doit apparaître : sans lui,
    un run largement invalide donnerait un classement fondé sur trois duels sans
    que rien ne le signale.

    Args:
        records: Générations du run.

    Returns:
        Nombre de couples (cas, répétition) à un seul modèle valide.
    """
    # Les créneaux sont recensés depuis **tous** les records, pas seulement les
    # valides : un cas où tous les modèles ont échoué ne créerait autrement aucune
    # entrée, et disparaîtrait à la fois des duels et du compte — c'est-à-dire que
    # l'indicateur serait aveugle précisément aux runs les plus dégradés.
    by_slot: Dict[Tuple[str, int], set] = {}
    for record in records:
        by_slot.setdefault((record.case_id, record.repetition), set())
        if record.status == "valid" and (record.json_content or "").strip():
            by_slot[(record.case_id, record.repetition)].add(record.model_id)
    return sum(1 for models in by_slot.values() if len(models) < 2)
