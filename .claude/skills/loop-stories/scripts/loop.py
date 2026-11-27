#!/usr/bin/env python3
"""Partie déterministe de la boucle de stories : choisir, vérifier, se souvenir.

Bibliothèque standard seulement. Tout se lit dans git (une ref, jamais l'arbre de
travail) : les stories livrées mais pas encore fusionnées ne sont visibles que sur
leur branche.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ARTIFACTS = "_bmad-output/implementation-artifacts"
STATUS_PATH = f"{ARTIFACTS}/sprint-status.yaml"
# Ancien nom du skill, gardé exprès : une série commencée sous ce nom doit rester visible,
# sinon sa story en cours serait relancée dans une deuxième session.
JOURNAL_NAME = "boucle-stories.json"

EPIC_LINE = re.compile(r"^\s+epic-(\d+):\s*([a-z-]+)")
STORY_LINE = re.compile(r"^\s+(\d+-\d+[a-z]?-[^:\s]+):\s*([a-z-]+)\s*(?:#\s*(.*))?$")
STORY_KEY = re.compile(r"^(\d+)-(\d+[a-z]?)-")

ACTIONABLE = {"backlog", "ready-for-dev"}
INTERRUPTED = {"in-progress", "review"}


class LoopError(Exception):
    """Erreur à montrer telle quelle à l'orchestrateur."""


def git(*args: str) -> str:
    """Exécute git et rend sa sortie ; lève LoopError en cas d'échec."""
    result = subprocess.run(["git", *args], capture_output=True, text=True, encoding="utf-8")
    if result.returncode != 0:
        raise LoopError(f"git {' '.join(args)} : {result.stderr.strip()}")
    return result.stdout


def parse_blocks(text: str) -> dict[int, dict]:
    """Un bloc = les lignes de story qui suivent `epic-N:`.

    L'appartenance suit la place dans le fichier, pas le préfixe : le bloc epic-20
    contient des stories 18-x, ordonnées là où elles doivent être faites.
    """
    blocks: dict[int, dict] = {}
    current: dict | None = None
    for line in text.splitlines():
        epic = EPIC_LINE.match(line)
        if epic:
            current = blocks[int(epic.group(1))] = {"status": epic.group(2), "stories": []}
            continue
        story = STORY_LINE.match(line)
        if story and current is not None:
            key, status, comment = story.groups()
            current["stories"].append({"key": key, "status": status, "comment": comment or ""})
    return blocks


def build_queue(
    text: str, epic: int | None = None, limit: int | None = None, journal: dict | None = None
) -> dict:
    """Prochaines stories actionnables et stories interrompues d'un epic."""
    blocks = parse_blocks(text)
    if epic is None:
        epic = next((n for n, b in blocks.items() if b["status"] == "in-progress"), None)
        if epic is None:
            raise LoopError("aucun epic `in-progress` : préciser --epic")
    if epic not in blocks:
        raise LoopError(f"epic-{epic} absent de {STATUS_PATH}")
    stories = blocks[epic]["stories"]
    # Une story lancée reste `backlog` hors de sa branche : seul le journal le sait,
    # et la relancer ouvrirait une deuxième session sur le même travail.
    launched = {key: e["etat"] for key, e in (journal or {}).items() if e.get("etat")}
    todo = [s for s in stories if s["status"] in ACTIONABLE and s["key"] not in launched]
    return {
        "epic": epic,
        "interrupted": [s for s in stories if s["status"] in INTERRUPTED],
        "next": todo[:limit] if limit else todo,
        "remaining": len(todo),
        "launched": {s["key"]: launched[s["key"]] for s in stories if s["key"] in launched},
    }


def story_status(text: str, key: str) -> str | None:
    """Statut d'une story dans le texte du tableau, ou None."""
    for block in parse_blocks(text).values():
        for story in block["stories"]:
            if story["key"] == key:
                return story["status"]
    return None


def spec_pattern(key: str) -> re.Pattern[str]:
    """Motif des fichiers de spec d'une story."""
    match = STORY_KEY.match(key)
    if not match:
        raise LoopError(f"clé de story illisible : {key}")
    epic, num = match.groups()
    # Une story découpée en cours de route donne spec-20-1a / spec-20-1b pour 20-1.
    suffix = "" if num[-1].isalpha() else "[a-z]?"
    return re.compile(rf"^{ARTIFACTS}/spec-{epic}-{num}{suffix}-.*\.md$")


def spec_status(text: str) -> str | None:
    """Statut du frontmatter d'une spec, ou None."""
    front = re.match(r"^---\r?\n(.*?)\r?\n---", text, re.DOTALL)
    if not front:
        return None
    status = re.search(r"^status:\s*['\"]?([a-z-]+)", front.group(1), re.MULTILINE)
    return status.group(1) if status else None


def succeeds(*args: str) -> bool:
    """Vrai si la commande git réussit."""
    return subprocess.run(["git", *args], capture_output=True).returncode == 0


def verify(branch: str, key: str, base: str) -> dict:
    """Contrôle ce qu'une session fille affirme avoir livré, sans la croire."""
    problems: list[str] = []
    # La référence livrée est la branche distante : un workflow peut y pousser une
    # fusion de `main` après la session, la locale est alors seulement en retard.
    remote = f"refs/remotes/origin/{branch}"
    if not succeeds("rev-parse", "--verify", "-q", remote):
        problems.append("branche pas poussée")
        delivered = branch
    else:
        delivered = remote
        local = f"refs/heads/{branch}"
        if succeeds("rev-parse", "--verify", "-q", local) and not succeeds(
            "merge-base", "--is-ancestor", local, remote
        ):
            problems.append("commits locaux non poussés")

    diff = git("diff", "--name-only", "-z", f"{base}...{delivered}")
    changed = [path for path in diff.split("\0") if path]

    status = story_status(git("show", f"{delivered}:{STATUS_PATH}"), key)
    if status != "done":
        problems.append(f"sprint-status : {key} est `{status}`, attendu `done`")

    pattern = spec_pattern(key)
    specs = [path for path in changed if pattern.match(path)]
    if not specs:
        problems.append("aucune spec de la story dans le diff")
    for path in specs:
        found = spec_status(git("show", f"{delivered}:{path}"))
        if found != "done":
            problems.append(f"{path} : statut `{found}`, attendu `done`")

    code = [path for path in changed if not path.startswith("_bmad-output/")]
    if not code:
        problems.append("aucun changement hors _bmad-output : rien n'a été implémenté")

    return {"ok": not problems, "problems": problems, "specs": specs, "files": len(changed)}


def ci_verdict(runs: list[dict]) -> str:
    """Verdict des exécutions de CI d'un même commit.

    `action_required` n'est pas une attente : GitHub crée ces exécutions pour un
    push du bot et ne les démarre jamais.
    """
    live = [r for r in runs if r.get("conclusion") not in ("action_required", "skipped")]
    done = [r["conclusion"] for r in live if r["status"] == "completed"]
    if any(c not in ("success", "neutral", "cancelled") for c in done):
        return "rouge"
    if len(done) < len(live):
        return "en-cours"
    return "verte" if "success" in done else "absente"


def gh_json(*args: str) -> dict | list:
    """Exécute gh et rend son JSON ; lève LoopError en cas d'échec."""
    result = subprocess.run(["gh", *args], capture_output=True, text=True, encoding="utf-8")
    if result.returncode != 0:
        raise LoopError(f"gh {' '.join(args)} : {result.stderr.strip()}")
    return json.loads(result.stdout)


def ci(pr: str) -> dict:
    """État de la CI sur le dernier commit d'une PR, lu dans les exécutions.

    La liste de contrôles de la PR ne suffit pas : une CI relancée par
    `workflow_dispatch` n'y apparaît pas.
    """
    view = gh_json("pr", "view", pr, "--json", "headRefOid,mergeable")
    head = view["headRefOid"]
    fields = "status,conclusion,event,url"
    runs = gh_json("run", "list", "--workflow", "ci.yml", "--commit", head, "--json", fields)
    verdict = ci_verdict(runs)
    return {
        "ok": verdict == "verte",
        "verdict": verdict,
        "head": head,
        "mergeable": view["mergeable"],
        "runs": runs,
    }


def journal_path() -> Path:
    """Emplacement du journal de la boucle."""
    # Dans le .git commun : partagé entre worktrees, jamais commité, ne salit rien.
    return Path(git("rev-parse", "--git-common-dir").strip()).resolve() / JOURNAL_NAME


def journal_update(path: Path, key: str | None, pairs: list[str]) -> dict:
    """Applique des champ=valeur à une story et rend le journal entier."""
    data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    if key:
        entry = data.setdefault(key, {})
        for pair in pairs:
            name, sep, value = pair.partition("=")
            if not sep:
                raise LoopError(f"attendu champ=valeur, reçu : {pair}")
            if value:
                entry[name] = value
            else:
                entry.pop(name, None)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data


def main(argv: list[str] | None = None) -> int:
    """Point d'entrée ; code 1 si la vérification échoue, 2 si erreur."""
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)

    queue = commands.add_parser("queue", help="prochaines stories d'un epic")
    queue.add_argument("--ref", default="origin/main")
    queue.add_argument("--epic", type=int)
    queue.add_argument("--limit", type=int)

    check = commands.add_parser("verify", help="contrôler la branche d'une story")
    check.add_argument("branch")
    check.add_argument("key")
    check.add_argument("--base", default="origin/main")

    checks = commands.add_parser("ci", help="CI du dernier commit d'une PR")
    checks.add_argument("pr")

    journal = commands.add_parser("journal", help="lire, ou écrire champ=valeur")
    journal.add_argument("key", nargs="?")
    journal.add_argument("pairs", nargs="*")

    args = parser.parse_args(argv)
    try:
        if args.command == "queue":
            board = git("show", f"{args.ref}:{STATUS_PATH}")
            known = journal_update(journal_path(), None, [])
            result = build_queue(board, args.epic, args.limit, known)
        elif args.command == "verify":
            result = verify(args.branch, args.key, args.base)
        elif args.command == "ci":
            result = ci(args.pr)
        else:
            result = journal_update(journal_path(), args.key, args.pairs)
    except LoopError as exc:
        print(f"erreur : {exc}", file=sys.stderr)
        return 2

    # Écriture en octets : la console Windows n'est pas en UTF-8.
    output = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    sys.stdout.buffer.write(output.encode("utf-8"))
    return 0 if result.get("ok", True) else 1


if __name__ == "__main__":
    sys.exit(main())
