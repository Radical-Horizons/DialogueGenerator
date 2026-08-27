"""Convergence des presets et du catalogue vers les templates.

Le risque tenu ici est la perte de donnée : la convergence copie, ne déplace pas, et
ne se déclare close qu'après un passage complet. Une reprise ne doit rien dupliquer.
"""
from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict, List

import pytest

from services.template_convergence_service import TemplateConvergenceService


class FauxTemplateService:
    """Cible en mémoire, avec un dossier réel pour le marqueur."""

    def __init__(self, templates_dir: Path, catalogue: List[Any] | None = None) -> None:
        self.templates_dir = templates_dir
        self.templates_dir.mkdir(parents=True, exist_ok=True)
        self._created: List[Dict[str, Any]] = []
        self._catalogue = catalogue or []
        self.echoue_sur: str | None = None

    def list_templates(self) -> List[Any]:
        return [SimpleNamespace(name=payload["name"]) for payload in self._created]

    def list_prebuilt_templates(self) -> List[Any]:
        return self._catalogue

    def create_template(self, payload: Dict[str, Any]) -> tuple[Any, List[str]]:
        if self.echoue_sur and payload["name"] == self.echoue_sur:
            raise OSError("disque plein")
        self._created.append(payload)
        return SimpleNamespace(name=payload["name"]), []

    @property
    def noms(self) -> List[str]:
        return [payload["name"] for payload in self._created]


def _preset(nom: str) -> SimpleNamespace:
    return SimpleNamespace(
        name=nom,
        icon="📄",
        configuration={"characters": [], "locations": [], "instructions": f"brief {nom}"},
    )


def _fiche(nom: str) -> SimpleNamespace:
    return SimpleNamespace(
        name=nom,
        description=f"desc {nom}",
        category="Rencontre",
        icon="👋",
        configuration={"characters": [], "locations": [], "instructions": f"brief {nom}"},
    )


@pytest.fixture
def cible(tmp_path: Path) -> FauxTemplateService:
    return FauxTemplateService(tmp_path / "custom", catalogue=[_fiche("Salutation")])


@pytest.mark.p0
def test_presets_et_catalogue_deviennent_des_templates(cible: FauxTemplateService) -> None:
    """Given des presets et un catalogue, when on converge, then tout devient template."""
    presets = SimpleNamespace(list_presets=lambda: [_preset("Duel"), _preset("Marché")])
    service = TemplateConvergenceService(template_service=cible, preset_service=presets)

    resultat = service.converge()

    assert resultat.from_presets == 2
    assert resultat.from_catalog == 1
    assert cible.noms == ["Duel", "Marché", "Salutation"]


def test_une_fiche_de_catalogue_devient_un_template_ordinaire(cible: FauxTemplateService) -> None:
    """Given une fiche livrée, when elle converge, then elle n'a plus rien de spécial.

    C'est tout l'objet de la convergence : une fiche du catalogue n'était pas
    modifiable parce qu'elle vivait dans un fichier de config, pas parce que ça avait
    du sens.
    """
    presets = SimpleNamespace(list_presets=list)
    TemplateConvergenceService(template_service=cible, preset_service=presets).converge()

    (fiche,) = [p for p in cible._created if p["name"] == "Salutation"]
    assert fiche["category"] == "Rencontre"
    assert fiche["configuration"]["instructions"] == "brief Salutation"
    assert "ownerId" not in fiche  # sans propriétaire : partagé, donc éditable par tous


@pytest.mark.p0
def test_une_seconde_execution_ne_duplique_rien(cible: FauxTemplateService) -> None:
    """Given une convergence faite, when on relance, then aucun appel, aucun doublon."""
    presets = SimpleNamespace(list_presets=lambda: [_preset("Duel")])
    service = TemplateConvergenceService(template_service=cible, preset_service=presets)
    service.converge()

    seconde = service.converge()

    assert seconde.already_done is True
    assert seconde.created == 0
    assert cible.noms == ["Duel", "Salutation"]


def test_un_nom_deja_present_est_ignore(cible: FauxTemplateService) -> None:
    """Given un template homonyme, when on converge, then il n'est pas recréé."""
    cible.create_template({"name": "Duel", "configuration": {}})
    presets = SimpleNamespace(list_presets=lambda: [_preset("Duel"), _preset("Marché")])

    resultat = TemplateConvergenceService(
        template_service=cible, preset_service=presets
    ).converge()

    assert resultat.from_presets == 1
    assert resultat.skipped == 1
    assert cible.noms.count("Duel") == 1


@pytest.mark.p0
def test_un_echec_laisse_la_convergence_ouverte(cible: FauxTemplateService) -> None:
    """Given un échec disque, when on converge, then le marqueur n'est pas posé.

    Le refermer perdrait définitivement ce qui n'est pas encore passé.
    """
    cible.echoue_sur = "Marché"
    presets = SimpleNamespace(list_presets=lambda: [_preset("Duel"), _preset("Marché")])
    service = TemplateConvergenceService(template_service=cible, preset_service=presets)

    with pytest.raises(OSError):
        service.converge()

    assert service.already_converged() is False


def test_la_reprise_ne_recree_pas_ce_qui_est_passe(cible: FauxTemplateService) -> None:
    """Given un échec partiel, when on reprend, then seul le manquant est créé."""
    cible.echoue_sur = "Marché"
    presets = SimpleNamespace(list_presets=lambda: [_preset("Duel"), _preset("Marché")])
    service = TemplateConvergenceService(template_service=cible, preset_service=presets)
    with pytest.raises(OSError):
        service.converge()

    cible.echoue_sur = None
    resultat = service.converge()

    assert resultat.from_presets == 1
    assert cible.noms.count("Duel") == 1
    assert "Marché" in cible.noms
