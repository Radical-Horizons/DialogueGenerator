"""Tous les candidats doivent recevoir le même échantillonnage.

Trois fois en septembre 2026, le banc a comparé des **réglages** en croyant
comparer des modèles : plafond de complétion hérité d'une autre époque, puis
`reasoning_effort` jamais transmis, puis contexte du juge tronqué. Chaque fois, le
paramètre déterminant existait quelque part sans être ni choisi ni vérifié.

La température est aujourd'hui uniforme à 0,7 — mais **par héritage**, pas par
décision : les modèles qui n'en déclarent pas reçoivent celle de la configuration
globale. Un modèle ajouté demain avec son propre `default_temperature` quitterait
la comparaison en silence. C'est exactement la forme des trois défauts précédents,
et c'est ce que ce test refuse.

Sonde du 2026-10-01, trois appels par régime via OpenRouter :

| Modèle | `temperature: 0.0` | `temperature: 2.0` |
|---|---|---|
| `openai/gpt-5.6-luna` | 3 valeurs distinctes | 2 valeurs distinctes |
| `z-ai/glm-5.3` | 3 valeurs distinctes | 3 réponses **vides** |

Lecture : la température est **inerte** sur GPT-5.6 (ni collapse à 0, ni dégât à 2,
aucune erreur) et **honorée** sur GLM, qui se casse à 2. Envoyer la même valeur à
tous ne produit donc pas le même régime : c'est « GPT-5.6 au défaut du
fournisseur, les autres à 0,7 ». On ne peut pas contrôler cet axe ; on peut
exiger qu'il ne bouge pas à notre insu.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

import pytest

GLOBAL_TEMPERATURE_KEY = "temperature"


@pytest.fixture(scope="module")
def llm_config() -> Dict[str, Any]:
    """Configuration LLM du dépôt, telle qu'elle est livrée."""
    path = Path(__file__).resolve().parents[1] / "config" / "llm_config.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _effective_temperature(config: Dict[str, Any], model: Dict[str, Any]) -> Any:
    """Température que `LLMClientFactory` posera pour ce modèle.

    Reproduit la règle de la fabrique : la config globale est copiée, puis
    `parameters.default_temperature` l'écrase s'il existe.
    """
    params = model.get("parameters") or {}
    if "default_temperature" in params:
        return params["default_temperature"]
    return config.get(GLOBAL_TEMPERATURE_KEY)


def _benchmark_models(config: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Modèles que le banc peut tirer, c'est-à-dire tout le catalogue servi."""
    return [
        model
        for model in config.get("available_models", [])
        if model.get("client_type") in {"openai", "openrouter", "mistral"}
    ]


def test_every_candidate_gets_the_same_temperature(llm_config: Dict[str, Any]) -> None:
    """Un seul régime d'échantillonnage pour tout le catalogue.

    Échec attendu si quelqu'un ajoute un modèle avec sa propre température : il
    faudra alors trancher explicitement, pas découvrir l'écart dans un classement.
    """
    temperatures = {
        str(model.get("api_identifier")): _effective_temperature(llm_config, model)
        for model in _benchmark_models(llm_config)
    }

    distinctes = set(temperatures.values())
    assert len(distinctes) == 1, (
        "Échantillonnage non uniforme, le banc comparerait des réglages : "
        f"{ {k: v for k, v in temperatures.items()} }"
    )


def test_no_candidate_declares_its_own_top_p(llm_config: Dict[str, Any]) -> None:
    """`top_p` doit rester absent partout.

    Le banc le met explicitement à `None` pour les tiers GPT-5.6, qui répondent 400
    sur l'API directe. Un `top_p` capturé en configuration pour un seul modèle
    rouvrirait le même écart, du côté où la requête ne le nettoie pas.
    """
    porteurs = [
        model.get("api_identifier")
        for model in _benchmark_models(llm_config)
        if "top_p" in (model.get("parameters") or {})
    ]

    assert porteurs == []


def test_the_global_temperature_is_declared(llm_config: Dict[str, Any]) -> None:
    """La valeur héritée doit exister : sinon chacun retombe au défaut du client.

    `OpenRouterClient` rabat sur 0,7 en dur quand la clé manque. S'y fier
    reviendrait à répliquer la valeur à deux endroits.
    """
    assert isinstance(llm_config.get(GLOBAL_TEMPERATURE_KEY), (int, float))
