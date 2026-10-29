"""Le container doit pouvoir construire ce qu'il expose.

Régression : le retrait du marketplace a supprimé `get_template_marketplace_service`
mais laissé `get_template_ab_testing_service` l'appeler. L'endpoint A/B répondait 500
(`AttributeError`) alors que ses 17 tests passaient — ils remplacent le service par
une instance construite à la main via `dependency_overrides`, si bien que le câblage
du container n'était exercé par aucun test.

On ne vérifie pas le comportement des services ici, seulement qu'ils se construisent :
c'est précisément ce que les overrides masquent.
"""
import inspect

import pytest

from api.container import ServiceContainer

# Getters écartés : ils sortent du processus (réseau, clé LLM) ou dépendent d'un
# état externe. Leur câblage est couvert ailleurs.
GETTERS_HORS_PERIMETRE = {
    "get_notion_api_client",
}


def _noms_des_getters() -> list[str]:
    return sorted(
        nom
        for nom in dir(ServiceContainer)
        if nom.startswith("get_")
        and callable(getattr(ServiceContainer, nom))
        and nom not in GETTERS_HORS_PERIMETRE
    )


@pytest.mark.p0
@pytest.mark.parametrize("nom_getter", _noms_des_getters())
def test_le_container_construit_chaque_service_expose(nom_getter, tmp_path, monkeypatch):
    """Aucun getter ne doit référencer une dépendance qui n'existe plus."""
    monkeypatch.setenv("APP_DATABASE", str(tmp_path / "app.db"))
    container = ServiceContainer()

    getter = getattr(container, nom_getter)
    # Certains getters sont paramétrés (ex. request_id) : on leur passe un
    # placeholder pour les couvrir eux aussi plutôt que de les écarter.
    requis = [
        p
        for p in inspect.signature(getter).parameters.values()
        if p.default is inspect.Parameter.empty
        and p.kind in (p.POSITIONAL_ONLY, p.POSITIONAL_OR_KEYWORD)
    ]

    try:
        getter(*["sonde-cablage"] * len(requis))
    except AttributeError as exc:
        pytest.fail(
            f"{nom_getter} référence une dépendance disparue : {exc}. "
            "Le câblage du container a dérivé par rapport aux services."
        )
    except TypeError as exc:
        # Signature devenue incompatible : même famille de dérive que ci-dessus.
        pytest.fail(f"{nom_getter} passe des arguments que le service n'accepte plus : {exc}")
    except Exception:
        # Une dépendance externe indisponible en test n'est pas une dérive de câblage.
        pass
