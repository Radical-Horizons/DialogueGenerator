"""Prompt juge qualité dialogue — logique métier uniquement (schéma = Pydantic)."""
from __future__ import annotations

# Instructions système : pas de duplication avec le schéma JSON imposé au modèle.
DIALOGUE_QUALITY_JUDGE_SYSTEM_PROMPT = (
    "Tu es un juge expert de dialogues pour RPG. Tu évalues un graphe de dialogue "
    "fourni en JSON Unity (schemaVersion + nodes). Sois factuel et concis. "
    "Remplis tous les champs requis du schéma de fonction."
)


def build_dialogue_quality_judge_user_prompt(unity_json: str) -> str:
    """Construit le message utilisateur envoyé au LLM juge.

    Args:
        unity_json: Document dialogue sérialisé (UTF-8, JSON Unity canonique).

    Returns:
        Texte du prompt utilisateur.
    """
    return (
        "Évalue la qualité narrative globale du dialogue suivant.\n\n"
        "Critères (un score 0–10 et un commentaire par critère) :\n"
        "- narrative_coherence : cohérence narrative et fluidité\n"
        "- characterization : crédibilité des voix / personnages\n"
        "- agency : espace laissé au joueur, enjeux des choix\n"
        "- style : clarté, rythme, qualité d'écriture\n\n"
        "overall_score : score global 0–10 cohérent avec les critères.\n"
        "global_comment : synthèse courte.\n"
        "improvement_suggestions : liste courte si la qualité est faible ; sinon [].\n"
        "strengths : liste courte des forces si la qualité est forte ; peut être [].\n\n"
        "Document JSON :\n```json\n"
        f"{unity_json}\n```"
    )
