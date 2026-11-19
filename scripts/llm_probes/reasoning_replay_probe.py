"""Sonde manuelle : un modèle OpenAI relancé retrouve-t-il le raisonnement de sa génération ?

Appels réels et facturés (quelques centimes), contenu synthétique uniquement. À relancer quand
OpenAI change le comportement du raisonnement ; résultats du 2026-11-19 et conclusions dans
``docs/architecture/conversations-ia.md``.

Méthode : une génération en appel de fonction forcé (comme le graphe), puis des relances.
Si ``input_tokens`` de la relance dépasse l'historique visible d'environ ``reasoning_tokens``
de la génération, le raisonnement a été réinjecté.

Usage (depuis la racine du dépôt) :
    .venv/Scripts/python.exe scripts/llm_probes/reasoning_replay_probe.py --model gpt-6.2-sol
"""
from __future__ import annotations

import argparse
import json
from typing import Any, Dict, List

from dotenv import load_dotenv
from openai import OpenAI

INSTRUCTIONS = (
    "Tu es un scénariste de RPG. Tu DOIS utiliser la fonction 'generate_interaction' "
    "pour formater ta réponse."
)
TOOL: Dict[str, Any] = {
    "type": "function",
    "name": "generate_interaction",
    "description": "Génère une réplique de PNJ.",
    "parameters": {
        "type": "object",
        "properties": {"speaker": {"type": "string"}, "line": {"type": "string"}},
        "required": ["speaker", "line"],
        "additionalProperties": False,
    },
    "strict": True,
}
FORCED_TOOL_CHOICE: Dict[str, Any] = {
    "type": "allowed_tools",
    "mode": "required",
    "tools": [{"type": "function", "name": "generate_interaction"}],
}
GENERATION_PROMPT = (
    "Écris la réplique d'un forgeron nain méfiant qui refuse de réparer l'épée d'un inconnu. "
    "Avant d'écrire, et uniquement dans ta réflexion : imagine cinq motifs possibles de sa "
    "méfiance, pèse-les un par un, retiens-en un seul ; puis tire au hasard un prix plancher "
    "entier entre 100 et 999 et invente un nom de minerai qui lui sert de mot de passe. Ces "
    "choix guident le ton, mais tu ne dois JAMAIS les écrire dans la réplique."
)
QUESTION = (
    "Le nœud est enregistré. Question de l'auteur : quels motifs de méfiance avais-tu envisagés, "
    "lequel as-tu retenu et pourquoi, quel prix plancher et quel mot de passe avais-tu choisis ? "
    "Si tu ne t'en souviens pas, dis-le franchement au lieu d'inventer."
)
REASONING = {"effort": "high", "summary": "auto"}


def _strip_none(value: Any) -> Any:
    """Retire récursivement les clés à ``None`` des items renvoyés par le SDK."""
    if isinstance(value, dict):
        return {k: _strip_none(v) for k, v in value.items() if v is not None}
    if isinstance(value, list):
        return [_strip_none(v) for v in value]
    return value


def _usage(response: Any) -> Dict[str, Any]:
    """Compteurs utiles d'une réponse Responses API."""
    details = getattr(response.usage, "output_tokens_details", None)
    return {
        "input": response.usage.input_tokens,
        "output": response.usage.output_tokens,
        "reasoning": getattr(details, "reasoning_tokens", None),
    }


def _text(response: Any) -> str:
    """Texte libre de la réponse (items ``message``)."""
    parts: List[str] = []
    for item in response.output:
        if item.type == "message":
            parts.extend(c.text for c in item.content or [] if getattr(c, "type", "") == "output_text")
    return " ".join(parts).strip()


def main() -> None:
    """Lance la génération puis les relances et affiche les compteurs."""
    parser = argparse.ArgumentParser(description="Sonde de réinjection du raisonnement OpenAI.")
    parser.add_argument("--model", default="gpt-6.2-sol")
    args = parser.parse_args()

    load_dotenv()
    client = OpenAI()
    base_input: List[Dict[str, Any]] = [{"role": "user", "content": GENERATION_PROMPT}]

    generation_params: Dict[str, Any] = dict(
        model=args.model,
        instructions=INSTRUCTIONS,
        input=base_input,
        tools=[TOOL],
        tool_choice=FORCED_TOOL_CHOICE,
        reasoning=REASONING,
    )
    generation = client.responses.create(**generation_params)
    items = [_strip_none(it) for it in json.loads(generation.model_dump_json())["output"]]
    call = next(it for it in items if it["type"] == "function_call")
    summary = " ".join(
        part.get("text", "")
        for it in items
        if it["type"] == "reasoning"
        for part in it.get("summary", [])
    )
    print("Génération", _usage(generation))
    print("Résumé lisible :", summary or "(aucun)")
    tool_output = {"type": "function_call_output", "call_id": call["call_id"], "output": "Nœud enregistré."}
    question = {"role": "user", "content": QUESTION}

    variants: Dict[str, Dict[str, Any]] = {
        "rejeu sans état, réponse texte": dict(
            instructions=INSTRUCTIONS, input=base_input + items + [tool_output, question],
            tools=[TOOL], tool_choice="none", reasoning=REASONING,
        ),
        "rejeu sans état, config identique": dict(
            instructions=INSTRUCTIONS, input=base_input + items + [tool_output, question],
            tools=[TOOL], tool_choice=FORCED_TOOL_CHOICE, reasoning=REASONING,
        ),
        "previous_response_id, réponse texte": dict(
            previous_response_id=generation.id, instructions=INSTRUCTIONS,
            input=[tool_output, question], tools=[TOOL], tool_choice="none", reasoning=REASONING,
        ),
    }
    for label, params in variants.items():
        try:
            response = client.responses.create(model=args.model, **params)
        except Exception as exc:  # noqa: BLE001 - la sonde doit afficher l'erreur exacte
            print(f"[{label}] erreur : {exc}")
            continue
        print(f"[{label}]", _usage(response), "|", _text(response)[:300])


if __name__ == "__main__":
    main()
