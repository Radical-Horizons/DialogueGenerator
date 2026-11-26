"""Partie déterministe du skill `boucle-stories`."""

import importlib.util
import subprocess
from collections.abc import Callable
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / ".claude/skills/boucle-stories/scripts/boucle.py"
SPEC = importlib.util.spec_from_file_location("boucle", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
boucle = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(boucle)

BOARD = """development_status:
  epic-6: done
  6-1-ancienne: done
  epic-20: in-progress
  20-1-texte: done  # volet 1
  # commentaire isolé
  20-2-perf: backlog
  18-4-annulation: ready-for-dev  # partiel livré
  20-6-script: review
  epic-20-retrospective: optional
  epic-18: backlog
  18-1-densite: done
"""


def test_queue_follows_the_block_not_the_prefix() -> None:
    """Le bloc epic-20 garde ses stories 18-x, dans l'ordre."""
    queue = boucle.build_queue(BOARD)

    assert queue["epic"] == 20
    assert [s["key"] for s in queue["next"]] == ["20-2-perf", "18-4-annulation"]
    assert queue["next"][1]["comment"] == "partiel livré"
    assert [s["key"] for s in queue["interrupted"]] == ["20-6-script"]


def test_queue_limit_keeps_the_total() -> None:
    """La limite ne masque pas le reste à faire."""
    queue = boucle.build_queue(BOARD, epic=20, limit=1)

    assert len(queue["next"]) == 1
    assert queue["remaining"] == 2


def test_queue_never_offers_a_story_already_launched() -> None:
    """Une story au journal n'est pas relancée, même `backlog` sur la ref."""
    journal = {"20-2-perf": {"etat": "bloquee"}, "_boucle": {"max": "3"}}

    queue = boucle.build_queue(BOARD, journal=journal)

    assert [s["key"] for s in queue["next"]] == ["18-4-annulation"]
    assert queue["launched"] == {"20-2-perf": "bloquee"}


def test_queue_rejects_unknown_epic() -> None:
    """Un epic absent est une erreur."""
    with pytest.raises(boucle.BoucleError):
        boucle.build_queue(BOARD, epic=99)


@pytest.mark.parametrize(
    ("key", "name", "expected"),
    [
        ("20-1-texte", "spec-20-1a-golden.md", True),
        ("20-1-texte", "spec-20-10-etats.md", False),
        ("18-5a-champ", "spec-18-5a-champ.md", True),
        ("18-5a-champ", "spec-18-5b-bloc.md", False),
    ],
)
def test_spec_pattern(key: str, name: str, expected: bool) -> None:
    """Une story ne prend pas la spec d'une voisine."""
    path = f"{boucle.ARTIFACTS}/{name}"

    assert bool(boucle.spec_pattern(key).match(path)) is expected


Repo = tuple[Callable[..., None], Callable[[str, str], None], Callable[[str], None]]


@pytest.fixture
def repo(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Repo:
    """Dépôt jetable avec une branche `story`."""
    monkeypatch.chdir(tmp_path)

    def run(*args: str) -> None:
        subprocess.run(["git", *args], check=True, capture_output=True)

    def write(path: str, content: str) -> None:
        target = tmp_path / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")

    def commit(message: str) -> None:
        run("add", ".")
        run("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-m", message)

    run("init", "-b", "main")
    write(boucle.STATUS_PATH, BOARD)
    commit("base")
    run("switch", "-c", "story")
    return run, write, commit


def test_verify_accepts_a_delivered_story(repo: Repo) -> None:
    """Livraison complète et poussée : aucun problème."""
    run, write, commit = repo
    write(boucle.STATUS_PATH, BOARD.replace("20-2-perf: backlog", "20-2-perf: done"))
    write(f"{boucle.ARTIFACTS}/spec-20-2-perf.md", "---\nstatus: 'done'\n---\n")
    write("frontend/perf.ts", "export {}\n")
    commit("livraison")
    run("update-ref", "refs/remotes/origin/story", "HEAD")

    assert boucle.verify("story", "20-2-perf", "main")["problems"] == []


def test_verify_lists_every_missing_proof(repo: Repo) -> None:
    """Chaque preuve manquante est listée."""
    _, write, commit = repo
    write(f"{boucle.ARTIFACTS}/spec-20-2-perf.md", "---\nstatus: in-review\n---\n")
    commit("à moitié")

    result = boucle.verify("story", "20-2-perf", "main")

    assert result["ok"] is False
    assert len(result["problems"]) == 4


def test_verify_reads_the_pushed_branch_with_accented_names(repo: Repo) -> None:
    """Locale en retard sur origin et nom de spec accentué : livraison valable."""
    run, write, commit = repo
    write(boucle.STATUS_PATH, BOARD.replace("20-2-perf: backlog", "20-2-perf: done"))
    write(f"{boucle.ARTIFACTS}/spec-20-2-qualité.md", "---\nstatus: done\n---\n")
    write("frontend/perf.ts", "export {}\n")
    commit("livraison")
    write("fusion-de-main.txt", "x\n")
    commit("poussé par le workflow")
    run("update-ref", "refs/remotes/origin/story", "HEAD")
    run("reset", "--hard", "HEAD~1")

    result = boucle.verify("story", "20-2-perf", "main")

    assert result["problems"] == []
    assert result["specs"] == [f"{boucle.ARTIFACTS}/spec-20-2-qualité.md"]


def test_journal_sets_and_clears_fields(tmp_path: Path) -> None:
    """Écrit, efface et relit le journal."""
    path = tmp_path / "journal.json"

    boucle.journal_update(path, "20-2-perf", ["session=local_1", "pr=7"])
    data = boucle.journal_update(path, "20-2-perf", ["pr="])

    assert data == {"20-2-perf": {"session": "local_1"}}
    assert boucle.journal_update(path, None, []) == data
