"""Un invité n'a que des droits de lecture sur les templates et les profils d'auteur.

Le mode invité existe pour montrer l'application à quelqu'un sans lui créer de compte.
Il ne doit donc rien pouvoir écrire sur le serveur.

Régression : seule la route A/B était fermée, parce qu'elle dépense du budget LLM. Le
reste des mutations acceptait une session anonyme — un invité pouvait créer un template
et, en posant `visibility: shared` explicitement dans le corps de la requête, le rendre
visible de toute l'équipe. La garde d'alors ne s'appliquait qu'en l'absence du champ,
ce qui contredisait sa propre justification (« un invité n'a pas d'équipe »).

Le test est paramétré sur la liste des mutations : une route d'écriture ajoutée sans
garde-fou fait échouer la suite au lieu de passer inaperçue.
"""
from typing import Any

import pytest
from fastapi.testclient import TestClient

UUID_QUELCONQUE = "11111111-2222-3333-4444-555555555555"

CORPS_TEMPLATE: dict[str, Any] = {
    "name": "sonde invité",
    "description": "d",
    "category": "c",
    "icon": "x",
    "configuration": {
        "characters": [],
        "locations": [],
        "region": "",
        "sceneType": "Generic",
        "instructions": "i",
    },
}

CORPS_PROFIL: dict[str, Any] = {
    "name": "voix de sonde",
    "description": "d",
    "content": "une voix",
}

MUTATIONS = [
    ("POST", "/api/v1/templates", CORPS_TEMPLATE),
    ("PUT", f"/api/v1/templates/{UUID_QUELCONQUE}", CORPS_TEMPLATE),
    ("DELETE", f"/api/v1/templates/{UUID_QUELCONQUE}", None),
    ("POST", f"/api/v1/templates/{UUID_QUELCONQUE}/copy", {}),
    ("POST", f"/api/v1/templates/{UUID_QUELCONQUE}/versions/v1/restore", {}),
    ("POST", "/api/v1/templates/suggestions/used", {"id": UUID_QUELCONQUE, "source": "custom"}),
    ("POST", "/api/v1/templates/ab-test", {
        "templateAId": "prebuilt:greeting",
        "templateBId": "prebuilt:confrontation",
        "generationsPerTemplate": 1,
        "maxDepth": 1,
    }),
    ("PATCH", f"/api/v1/templates/ab-test/{UUID_QUELCONQUE}/feedback",
     {"generationId": "g1", "thumb": "up"}),
    ("POST", "/api/v1/author-profiles", CORPS_PROFIL),
    ("PUT", f"/api/v1/author-profiles/{UUID_QUELCONQUE}", CORPS_PROFIL),
    ("DELETE", f"/api/v1/author-profiles/{UUID_QUELCONQUE}", None),
]


@pytest.fixture
def client_invite(client: TestClient) -> TestClient:
    """Client authentifié comme session invitée."""
    from api.routers.auth import get_current_user
    from api.main import app

    app.dependency_overrides[get_current_user] = lambda: {
        "sub": "guest-sonde",
        "sid": "sonde",
        "role": "guest",
        "username": "invité",
    }
    yield client
    app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.p0
@pytest.mark.parametrize("methode,chemin,corps", MUTATIONS, ids=lambda v: v if isinstance(v, str) else "")
def test_chaque_mutation_refuse_une_session_invitee(client_invite, methode, chemin, corps):
    """Aucune écriture n'est permise à un invité, quel que soit le corps envoyé."""
    reponse = client_invite.request(methode, chemin, json=corps)

    assert reponse.status_code == 403, (
        f"{methode} {chemin} a répondu {reponse.status_code} au lieu de 403 : "
        "un invité ne doit pas pouvoir écrire."
    )


@pytest.mark.p0
def test_un_invite_ne_peut_pas_se_declarer_partage(client_invite):
    """Poser `visibility: shared` explicitement ne contourne pas le refus.

    C'est le contournement exact qui existait : la garde précédente ne s'appliquait
    que si le client omettait le champ.
    """
    reponse = client_invite.post(
        "/api/v1/templates",
        json={**CORPS_TEMPLATE, "visibility": "shared"},
    )

    assert reponse.status_code == 403


@pytest.mark.p0
def test_un_invite_garde_ses_droits_de_lecture(client_invite):
    """La lecture reste ouverte : le mode invité sert à montrer l'application."""
    assert client_invite.get("/api/v1/templates").status_code == 200
    assert client_invite.get("/api/v1/templates/prebuilt").status_code == 200
    assert client_invite.get("/api/v1/author-profiles").status_code == 200
    assert client_invite.get("/api/v1/author-profiles/prebuilt").status_code == 200
