"""Golden de l'export Unity, chemins Python (Story 20.1, risque R-01).

Deux chemins, comparés au texte de ``tests/fixtures/unity_dialogues/expected/<chemin>/<fixture>.json``
(ou ``.error.txt`` si le chemin rejette l'entrée) :

- ``python-graphe`` : ``POST /api/v1/unity-dialogues/graph/save-and-write`` (vraie route,
  validation de schéma comprise) sur le corps que le front lui envoie, figé par Vitest dans
  ``expected/front-payload/`` ; un refus HTTP est figé dans ``.error.txt`` ;
- ``python-lot`` : ``export_persisted_document`` (export par lot) sur la fixture d'entrée.

Les attendus figent le comportement actuel, défauts compris : un écart est une
régression, ou un changement de contrat qui se régénère dans une PR à part
(``UPDATE_GOLDEN=1``, Vitest d'abord). Pendant front :
``frontend/src/__tests__/unityExport.golden.test.ts``.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Callable, Optional, Tuple
from unittest.mock import create_autospec

import pytest

from services.batch_export_service import export_persisted_document
from services.configuration_service import ConfigurationService

GOLDEN_ROOT = Path(__file__).resolve().parents[1] / "fixtures" / "unity_dialogues"
INPUTS_DIR = GOLDEN_ROOT / "inputs"
EXPECTED_DIR = GOLDEN_ROOT / "expected"
UPDATE_ENV = "UPDATE_GOLDEN"
FRONT_PAYLOAD = "front-payload"
# Chemins figés par le test Vitest : seuls connus ici pour signaler les attendus orphelins.
FRONT_PATHS = frozenset({"front-canonique", "front-invite", FRONT_PAYLOAD})
EXTENSIONS = (".json", ".error.txt")
SAVE_AND_WRITE_URL = "/api/v1/unity-dialogues/graph/save-and-write"
VOLATILE_ERROR_KEYS = frozenset({"request_id", "timestamp"})


class GoldenHarnessError(Exception):
    """Défaillance du banc (entrée manquante) : le test échoue, rien n'est figé."""


class FrontPayloadRejected(Exception):
    """Le front n'envoie aucun corps pour cette fixture : ``python-graphe`` n'a pas d'entrée."""


class HttpRejection(Exception):
    """Réponse non 2xx de la route ; ``str(exc)`` est le texte figé dans ``.error.txt``."""


def _config_for(unity_dir: Path) -> ConfigurationService:
    """``ConfigurationService`` dont le dossier Unity est ``unity_dir``."""
    config = create_autospec(ConfigurationService, instance=True)
    config.get_unity_dialogues_path.return_value = str(unity_dir)
    return config


def _without_volatile(value: Any) -> Any:
    """Retire récursivement ``request_id`` et ``timestamp``, propres à chaque appel."""
    if isinstance(value, dict):
        return {k: _without_volatile(v) for k, v in value.items() if k not in VOLATILE_ERROR_KEYS}
    if isinstance(value, list):
        return [_without_volatile(v) for v in value]
    return value


def describe_http_rejection(status_code: int, body: Any, unity_dir: Path) -> str:
    """Texte stable d'un refus HTTP : statut, corps sans identifiant de requête ni chemin."""
    text = json.dumps(_without_volatile(body), ensure_ascii=False, indent=2, sort_keys=True)
    for form in (str(unity_dir), json.dumps(str(unity_dir))[1:-1]):
        text = text.replace(form, "<unity_dir>")
    return f"HTTP {status_code}: {text}\n"


def render_python_graph(raw: str, fixture: str, work_dir: Path) -> str:
    """``POST save-and-write`` du corps que le front envoie pour cette fixture.

    La vraie route tourne (validation de schéma, titre, flags, écriture) avec un dossier
    Unity dans ``work_dir`` ; la sortie est le ``json_content`` de la réponse.
    """
    payload_dir = EXPECTED_DIR / FRONT_PAYLOAD
    payload_path = payload_dir / f"{fixture}.json"
    if not payload_path.exists():
        if (payload_dir / f"{fixture}.error.txt").exists():
            raise FrontPayloadRejected(f"{FRONT_PAYLOAD} rejette {fixture} : aucun corps à envoyer")
        raise GoldenHarnessError(
            f"{FRONT_PAYLOAD}/{fixture}.json absent : lancer d'abord le golden Vitest "
            f"avec {UPDATE_ENV}=1"
        )
    # Import local : ``scripts/golden-export-local.py`` réutilise ce module sans charger l'API.
    from fastapi.testclient import TestClient

    from api.dependencies import get_config_service
    from api.main import app

    unity_dir = work_dir / "unity"
    app.dependency_overrides[get_config_service] = lambda: _config_for(unity_dir)
    try:
        response = TestClient(app).post(
            SAVE_AND_WRITE_URL,
            content=payload_path.read_bytes(),
            headers={"Content-Type": "application/json"},
        )
    finally:
        app.dependency_overrides.pop(get_config_service, None)
    if not 200 <= response.status_code < 300:
        raise HttpRejection(describe_http_rejection(response.status_code, response.json(), unity_dir))
    return str(response.json()["json_content"])


def render_python_lot(raw: str, fixture: str, work_dir: Path) -> str:
    """Export par lot d'un document persisté, réécrit sur place dans ``work_dir``."""
    work_dir.mkdir(parents=True, exist_ok=True)
    (work_dir / f"{fixture}.json").write_bytes(raw.encode("utf-8"))
    config = _config_for(work_dir)
    file_path, _name = export_persisted_document(config, fixture, skip_validation=True)
    return file_path.read_bytes().decode("utf-8")


PATHS: dict[str, Callable[[str, str, Path], str]] = {
    "python-graphe": render_python_graph,
    "python-lot": render_python_lot,
}


def _to_lf(text: str) -> str:
    """Ramène les fins de ligne à LF (``write_text`` écrit en CRLF sous Windows)."""
    return text.replace("\r\n", "\n")


def render(path_name: str, raw: str, fixture: str, work_dir: Path) -> Tuple[str, str]:
    """Exécute un chemin et renvoie ``(extension, texte)``.

    Un chemin qui lève fige son erreur (type et message, ou refus HTTP) dans
    ``.error.txt`` ; une erreur du banc, ou l'absence de corps front, remonte telle quelle.
    """
    try:
        return ".json", _to_lf(PATHS[path_name](raw, fixture, work_dir))
    except (GoldenHarnessError, FrontPayloadRejected):
        raise
    except HttpRejection as exc:
        return ".error.txt", str(exc)
    except Exception as exc:  # noqa: BLE001 — l'erreur actuelle fait partie du golden
        return ".error.txt", f"{type(exc).__name__}: {exc}\n"


def read_input(fixture: str, inputs_dir: Path = INPUTS_DIR) -> str:
    """Lit une fixture d'entrée, décodée en UTF-8 sans transformation."""
    return (inputs_dir / f"{fixture}.json").read_bytes().decode("utf-8")


def first_difference(expected: str, actual: str) -> str:
    """Décrit la première ligne qui diffère entre deux textes."""
    expected_lines = expected.split("\n")
    actual_lines = actual.split("\n")
    for index in range(max(len(expected_lines), len(actual_lines))):
        exp = expected_lines[index] if index < len(expected_lines) else "<fin du fichier>"
        act = actual_lines[index] if index < len(actual_lines) else "<fin du fichier>"
        if exp != act:
            return f"ligne {index + 1}\n  attendu : {exp!r}\n  obtenu  : {act!r}"
    return "aucune ligne ne diffère"


def compare_with_golden(
    path_name: str,
    fixture: str,
    extension: str,
    actual: str,
    *,
    expected_dir: Path = EXPECTED_DIR,
    update: bool = False,
) -> Optional[str]:
    """Compare ``actual`` au fichier attendu ; renvoie un message d'écart ou ``None``.

    En mode mise à jour, réécrit l'attendu (et retire celui de l'autre forme,
    ``.json`` ou ``.error.txt``) au lieu de comparer.
    """
    target_dir = expected_dir / path_name
    expected_path = target_dir / f"{fixture}{extension}"
    other_extension = ".error.txt" if extension == ".json" else ".json"
    other_path = target_dir / f"{fixture}{other_extension}"

    if update:
        target_dir.mkdir(parents=True, exist_ok=True)
        expected_path.write_bytes(actual.encode("utf-8"))
        if other_path.exists():
            other_path.unlink()
        return None

    label = f"golden {fixture} / {path_name}"
    if not expected_path.exists():
        if other_path.exists():
            return (
                f"{label} : la sortie est un {extension} alors que l'attendu est "
                f"{other_path.name}"
            )
        return f"{label} : attendu absent ({expected_path.name}) — lancer avec {UPDATE_ENV}=1"

    expected = expected_path.read_bytes().decode("utf-8")
    if expected == actual:
        return None
    return f"{label} ({expected_path.name}) : {first_difference(expected, actual)}"


def fixture_names(inputs_dir: Path = INPUTS_DIR) -> list[str]:
    """Noms des fixtures d'entrée : tout nouveau fichier est testé d'office."""
    return sorted(p.stem for p in inputs_dir.glob("*.json"))


def orphan_expected(
    expected_dir: Path, fixtures: list[str], known_paths: frozenset[str]
) -> list[str]:
    """Attendus sans fixture d'entrée, rangés sous un chemin inconnu, ou hors de tout chemin."""
    orphans: list[str] = sorted(p.name for p in expected_dir.iterdir() if not p.is_dir())
    known_fixtures = set(fixtures)
    for path_dir in sorted(p for p in expected_dir.iterdir() if p.is_dir()):
        for expected in sorted(path_dir.iterdir()):
            stem = next(
                (expected.name[: -len(ext)] for ext in EXTENSIONS if expected.name.endswith(ext)),
                None,
            )
            if path_dir.name not in known_paths or stem not in known_fixtures:
                orphans.append(f"{path_dir.name}/{expected.name}")
    return orphans


def stale_expected_without_input(
    path_name: str,
    fixture: str,
    *,
    expected_dir: Path = EXPECTED_DIR,
    update: bool = False,
) -> Optional[str]:
    """Attendu restant pour un chemin privé d'entrée ; retiré en mode mise à jour.

    Returns:
        Message d'écart si un attendu subsiste hors mode mise à jour, sinon ``None``.
    """
    stale = [expected_dir / path_name / f"{fixture}{ext}" for ext in EXTENSIONS]
    stale = [path for path in stale if path.exists()]
    if update:
        for path in stale:
            path.unlink()
        return None
    if stale:
        names = ", ".join(path.name for path in stale)
        return (
            f"golden {fixture} / {path_name} : {FRONT_PAYLOAD} rejette l'entrée, mais "
            f"l'attendu {names} subsiste — lancer avec {UPDATE_ENV}=1"
        )
    return None


@pytest.mark.p0
@pytest.mark.unit
@pytest.mark.parametrize("path_name", sorted(PATHS))
@pytest.mark.parametrize("fixture", fixture_names())
def test_unity_export_matches_golden(fixture: str, path_name: str, tmp_path: Path) -> None:
    """La sortie de chaque chemin Python est identique, au caractère près, à son attendu."""
    update = os.environ.get(UPDATE_ENV) == "1"
    try:
        extension, actual = render(path_name, read_input(fixture), fixture, tmp_path)
    except FrontPayloadRejected as exc:
        stale = stale_expected_without_input(path_name, fixture, update=update)
        assert stale is None, stale
        pytest.skip(str(exc))
    message = compare_with_golden(path_name, fixture, extension, actual, update=update)
    assert message is None, message


@pytest.mark.p0
@pytest.mark.unit
def test_golden_has_input_fixtures() -> None:
    """Sans fixture, le paramétrage serait sauté sans échec."""
    assert fixture_names(), f"aucune fixture dans {INPUTS_DIR}"


@pytest.mark.p0
@pytest.mark.unit
def test_golden_has_no_orphan_expected() -> None:
    """Chaque attendu correspond à une fixture et à un chemin, Python ou front."""
    orphans = orphan_expected(EXPECTED_DIR, fixture_names(), frozenset(PATHS) | FRONT_PATHS)
    assert not orphans, f"attendus orphelins (fixture ou chemin retiré) : {orphans}"


@pytest.mark.unit
def test_orphan_expected_flags_unknown_fixture_and_path(tmp_path: Path) -> None:
    """Un attendu sans entrée, ou sous un chemin disparu, est signalé."""
    expected_dir = tmp_path / "expected"
    (expected_dir / "python-lot").mkdir(parents=True)
    (expected_dir / "python-lot" / "demo.json").write_bytes(b"{}")
    (expected_dir / "python-lot" / "retire.error.txt").write_bytes(b"x")
    (expected_dir / "ancien-chemin").mkdir()
    (expected_dir / "ancien-chemin" / "demo.json").write_bytes(b"{}")
    (expected_dir / "demo.json").write_bytes(b"{}")

    orphans = orphan_expected(expected_dir, ["demo"], frozenset({"python-lot"}))

    assert orphans == ["demo.json", "ancien-chemin/demo.json", "python-lot/retire.error.txt"]


@pytest.mark.unit
def test_golden_reports_fixture_path_and_first_different_line(tmp_path: Path) -> None:
    """Un écart nomme la fixture, le chemin et la première ligne qui diffère."""
    (tmp_path / "python-lot").mkdir()
    (tmp_path / "python-lot" / "demo.json").write_bytes(b'{\n  "a": 1\n}')

    message = compare_with_golden(
        "python-lot", "demo", ".json", '{\n  "a": 2\n}', expected_dir=tmp_path
    )

    assert message is not None
    assert "demo / python-lot" in message
    assert "ligne 2" in message


@pytest.mark.unit
def test_golden_missing_expected_asks_for_update_and_writes_nothing(tmp_path: Path) -> None:
    """Sans attendu, le test échoue et ne crée rien hors du mode mise à jour."""
    message = compare_with_golden("python-graphe", "neuf", ".json", "{}", expected_dir=tmp_path)

    assert message is not None
    assert f"{UPDATE_ENV}=1" in message
    assert not (tmp_path / "python-graphe").exists()


@pytest.mark.unit
def test_golden_update_mode_rewrites_expected_and_drops_other_form(tmp_path: Path) -> None:
    """En mode mise à jour, l'attendu est réécrit et l'ancienne forme (.error.txt) retirée."""
    target = tmp_path / "python-lot"
    target.mkdir()
    (target / "demo.error.txt").write_bytes(b"ValueError: ancien\n")

    message = compare_with_golden(
        "python-lot", "demo", ".json", '{\n  "a": 1\n}', expected_dir=tmp_path, update=True
    )

    assert message is None
    assert (target / "demo.json").read_bytes() == b'{\n  "a": 1\n}'
    assert not (target / "demo.error.txt").exists()
    assert compare_with_golden("python-lot", "demo", ".json", '{\n  "a": 1\n}', expected_dir=tmp_path) is None


@pytest.mark.unit
def test_golden_freezes_error_of_a_path_that_rejects_its_input(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Un chemin qui lève produit un .error.txt (type + message), comparé comme un .json."""

    def _rejects(raw: str, fixture: str, work_dir: Path) -> str:
        raise ValueError("entrée refusée")

    monkeypatch.setitem(PATHS, "python-lot", _rejects)
    extension, text = render("python-lot", "[]", "demo", tmp_path / "work")

    assert (extension, text) == (".error.txt", "ValueError: entrée refusée\n")
    expected_dir = tmp_path / "expected"
    compare_with_golden("python-lot", "demo", extension, text, expected_dir=expected_dir, update=True)
    assert compare_with_golden("python-lot", "demo", extension, text, expected_dir=expected_dir) is None
    mismatch = compare_with_golden("python-lot", "demo", ".json", "{}", expected_dir=expected_dir)
    assert mismatch is not None and "demo.error.txt" in mismatch


@pytest.mark.unit
def test_golden_harness_error_is_raised_not_frozen(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Une défaillance du banc fait échouer le test au lieu d'être figée en .error.txt."""

    def _missing_input(raw: str, fixture: str, work_dir: Path) -> str:
        raise GoldenHarnessError("entrée du banc absente")

    monkeypatch.setitem(PATHS, "python-graphe", _missing_input)

    with pytest.raises(GoldenHarnessError):
        render("python-graphe", "{}", "demo", tmp_path)


@pytest.mark.unit
def test_stale_expected_fails_when_input_is_rejected_and_is_removed_on_update(
    tmp_path: Path,
) -> None:
    """Sans corps front, un ancien attendu python-graphe fait échouer, puis s'efface en mise à jour."""
    (tmp_path / "python-graphe").mkdir()
    (tmp_path / "python-graphe" / "demo.json").write_bytes(b"{}")

    message = stale_expected_without_input("python-graphe", "demo", expected_dir=tmp_path)

    assert message is not None and "demo.json" in message
    assert stale_expected_without_input(
        "python-graphe", "demo", expected_dir=tmp_path, update=True
    ) is None
    assert not (tmp_path / "python-graphe" / "demo.json").exists()
    assert stale_expected_without_input("python-graphe", "demo", expected_dir=tmp_path) is None


@pytest.mark.unit
def test_http_rejection_text_drops_request_id_and_unity_dir(tmp_path: Path) -> None:
    """Le texte figé d'un refus HTTP ne garde ni identifiant de requête ni chemin local."""
    body = {
        "error": {
            "code": "VALIDATION_ERROR",
            "message": f"écriture refusée dans {tmp_path}",
            "request_id": "abc",
        }
    }

    text = describe_http_rejection(422, body, tmp_path)

    assert text.startswith("HTTP 422: {")
    assert "abc" not in text and "request_id" not in text
    assert str(tmp_path) not in text and "<unity_dir>" in text
