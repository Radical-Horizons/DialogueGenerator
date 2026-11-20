"""Conventions partagées entre les clients LLM et la relecture de leurs appels trackés.

Les clients écrivent le prompt dans le suivi d'usage avec ces conventions ;
``services/generation_trace.py`` les relit pour rejouer une génération. Une seule source,
pour qu'un changement d'un côté ne casse pas l'autre en silence.
"""

# Ajouté aux instructions système quand une sortie structurée est demandée : le prompt
# tracké le contient donc. Une conversation qui rejoue la génération en texte libre le retire.
STRUCTURED_OUTPUT_INSTRUCTION_SUFFIX = (
    " Tu DOIS utiliser la fonction 'generate_interaction' pour formater ta réponse."
)

# Prompt tracké par le client OpenAI : ``{instructions}{marqueur}{messages JSON}``.
TRACKED_PROMPT_INPUT_MARKER = "\n\n--- Input ---\n"


def format_tracked_prompt(instructions: str, messages_json: str) -> str:
    """Prompt tracké au format OpenAI (instructions séparées des messages d'entrée).

    Args:
        instructions: Instructions système envoyées au modèle.
        messages_json: Messages d'entrée sérialisés en JSON (sauts de ligne échappés).
    """
    return f"{instructions}{TRACKED_PROMPT_INPUT_MARKER}{messages_json}"
