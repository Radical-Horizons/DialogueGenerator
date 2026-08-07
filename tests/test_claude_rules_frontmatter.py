"""Garde-fous sur le frontmatter des règles `.claude/rules/`.

Claude Code charge **toute** règle dépourvue de `paths:` à chaque session, au même
niveau que `CLAUDE.md`. Les champs `globs:` et `alwaysApply:` viennent de Cursor et
sont ignorés : les réintroduire ne restreint rien, ça rend la règle permanente sans
que personne ne le voie. Le dépôt a vécu ça — 41 règles, 119 Ko chargés en continu.

Ces tests figent donc trois invariants :

1. aucun champ Cursor résiduel ;
2. tout motif `paths` désigne au moins un fichier réel (un motif mort désactive la
   règle en silence, ce qui est pire qu'une règle absente) ;
3. les règles déclenchées par une **action** — pousser, ouvrir une PR, choisir un
   ton — restent toujours actives, car aucun chemin ne les ferait apparaître au bon
   moment.
"""
from __future__ import annotations

import os
import re
from pathlib import Path

import pytest
import yaml

PROJECT_ROOT = Path(__file__).resolve().parent.parent
RULES_DIR = PROJECT_ROOT / ".claude" / "rules"

FRONTMATTER_RE = re.compile(r"^---\n(.*?)\n---\n", re.DOTALL)

#: Répertoires jamais explorés pour vérifier un motif. `.venv` et les worktrees
#: contiennent chacun une copie complète du dépôt : les traverser transformerait ce
#: test en minutes de parcours (cf. `.claude/rules/tests.md`).
EXCLUDED_DIRS = frozenset(
    {
        ".git",
        ".venv",
        "venv",
        "node_modules",
        "__pycache__",
        ".pytest_cache",
        ".mypy_cache",
        "worktrees",
        "dist",
        "build",
        ".archive",
        ".staging",
        "tmp",
    }
)

#: Règles qui doivent rester chargées à chaque session. Leur déclencheur n'est pas
#: un fichier lu mais une action entreprise : `git push`, `gh pr create`, déléguer,
#: répondre. Leur donner un `paths` les rendrait muettes précisément quand elles
#: comptent.
ALWAYS_ACTIVE = frozenset(
    {
        "agentivity.md",
        "application_role.md",
        "branching.md",
        "ci_before_push.md",
        "env.md",
        "git_commit.md",
        "interaction_style.md",
        "meta_agent.md",
        "shell_discipline.md",
        "workflow.md",
    }
)


def _rule_files() -> list[Path]:
    return sorted(RULES_DIR.glob("*.md"))


def _frontmatter(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    match = FRONTMATTER_RE.match(text)
    if not match:
        return {}
    try:
        return yaml.safe_load(match.group(1)) or {}
    except yaml.YAMLError as exc:  # pragma: no cover - message d'échec explicite
        raise AssertionError(f"{path.name} : frontmatter YAML invalide — {exc}") from exc


def _repo_files() -> list[str]:
    """Chemins POSIX relatifs à la racine, arborescences lourdes élaguées."""
    found: list[str] = []
    for dirpath, dirnames, filenames in os.walk(PROJECT_ROOT):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDED_DIRS]
        rel_dir = Path(dirpath).relative_to(PROJECT_ROOT)
        for name in filenames:
            rel = rel_dir / name if str(rel_dir) != "." else Path(name)
            found.append(rel.as_posix())
    return found


@pytest.fixture(scope="module")
def repo_files() -> list[str]:
    return _repo_files()


def _expand_braces(pattern: str) -> list[str]:
    """Développe une seule alternance `{a,b}` — la forme utilisée par les règles."""
    match = re.search(r"\{([^{}]*)\}", pattern)
    if not match:
        return [pattern]
    variants = []
    for option in match.group(1).split(","):
        variants.extend(
            _expand_braces(pattern[: match.start()] + option + pattern[match.end() :])
        )
    return variants


def _matches(pattern: str, files: list[str]) -> bool:
    """Vrai si au moins un fichier du dépôt correspond, sémantique glob de Claude Code."""
    from fnmatch import fnmatch

    for variant in _expand_braces(pattern):
        # `**/` traverse les séparateurs, `*` non : fnmatch ne fait pas la
        # distinction, on l'approxime en testant la forme avec et sans le segment.
        candidates = {variant}
        if variant.endswith("/**"):
            candidates.add(variant + "/*")
            candidates.add(variant[:-3] + "/*")
        if "/**/" in variant:
            candidates.add(variant.replace("/**/", "/"))
        for candidate in candidates:
            if any(fnmatch(f, candidate) for f in files):
                return True
    return False


@pytest.mark.p0
@pytest.mark.parametrize("rule", _rule_files(), ids=lambda p: p.name)
def test_frontmatter_analysable(rule: Path) -> None:
    """Un `: ` non quoté dans une description casse l'analyse — et le `paths` avec.

    `description: Invariants. Procédure : skill x` était lu comme un mapping imbriqué :
    le frontmatter entier devenait invalide, donc la règle redevenait permanente sans
    que rien ne le signale.
    """
    assert isinstance(_frontmatter(rule), dict)


@pytest.mark.p0
@pytest.mark.parametrize("rule", _rule_files(), ids=lambda p: p.name)
def test_pas_de_champ_cursor(rule: Path) -> None:
    """`globs` et `alwaysApply` sont ignorés par Claude Code : ils trompent le lecteur."""
    front = _frontmatter(rule)
    interdits = sorted({"globs", "alwaysApply"} & set(front))
    assert not interdits, (
        f"{rule.name} porte {interdits}, champ(s) Cursor sans effet ici. "
        "Utiliser `paths:` pour restreindre, ou ne rien mettre pour rester actif."
    )


@pytest.mark.p0
@pytest.mark.parametrize("rule", _rule_files(), ids=lambda p: p.name)
def test_regles_declenchees_par_action_toujours_actives(rule: Path) -> None:
    """Une règle de processus ne peut pas être conditionnée à un chemin."""
    if rule.name not in ALWAYS_ACTIVE:
        return
    front = _frontmatter(rule)
    assert "paths" not in front, (
        f"{rule.name} se déclenche sur une action, pas sur un fichier : "
        "un `paths` la rendrait muette au moment où elle compte."
    )


@pytest.mark.p0
@pytest.mark.parametrize("rule", _rule_files(), ids=lambda p: p.name)
def test_motifs_paths_designent_des_fichiers_reels(
    rule: Path, repo_files: list[str]
) -> None:
    """Un motif mort désactive la règle en silence."""
    paths = _frontmatter(rule).get("paths")
    if not paths:
        return
    assert isinstance(paths, list), f"{rule.name} : `paths` doit être une liste"
    morts = [p for p in paths if not _matches(p, repo_files)]
    assert not morts, (
        f"{rule.name} : motif(s) sans correspondance dans le dépôt {morts}. "
        "Une règle qui ne peut pas se déclencher n'existe pas."
    )


@pytest.mark.p0
def test_crochets_echappes_dans_les_motifs() -> None:
    """`[` ouvre une classe de caractères : non échappé, le motif ne matche rien."""
    fautifs = []
    for rule in _rule_files():
        for pattern in _frontmatter(rule).get("paths") or []:
            if re.search(r"(?<!\\)\[", pattern):
                fautifs.append(f"{rule.name} -> {pattern}")
    assert not fautifs, f"crochet non échappé : {fautifs}"


@pytest.mark.p0
def test_toutes_les_regles_toujours_actives_existent() -> None:
    """La liste ci-dessus doit suivre les renommages et suppressions."""
    presentes = {p.name for p in _rule_files()}
    manquantes = sorted(ALWAYS_ACTIVE - presentes)
    assert not manquantes, (
        f"règles listées comme toujours actives mais absentes : {manquantes}"
    )
