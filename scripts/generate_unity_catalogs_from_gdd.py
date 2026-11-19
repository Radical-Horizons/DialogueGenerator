"""Génère SkillCatalog.csv / TraitCatalog.csv depuis le GDD (one-shot)."""
from __future__ import annotations

import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UNITY = ROOT / "data" / "UnityData"
SKILLS_JSON = ROOT / "data" / "GDD_categories" / "Compétences.json"
# Bases canoniques des traits (page Notion « Traits de caractère », § 1) : chaque qualité
# pointe vers son défaut opposé ; la paire forme un axe signé.
QUALITIES_JSON = ROOT / "data" / "GDD_categories" / "Qualités.json"
FLAWS_JSON = ROOT / "data" / "GDD_categories" / "Défauts.json"


def gen_skills() -> int:
    records = json.loads(SKILLS_JSON.read_text(encoding="utf-8"))
    out = UNITY / "SkillCatalog.csv"
    rows: list[dict[str, str]] = []
    seen: set[str] = set()
    for rec in records:
        if not isinstance(rec, dict):
            continue
        name = str(rec.get("Nom") or "").strip()
        if not name or name in seen:
            continue
        seen.add(name)
        values = rec.get("values") if isinstance(rec.get("values"), dict) else {}
        famille = str(values.get("Famille") or "").strip()
        rows.append({"Compétence": name, "Famille": famille, "ID export": ""})
    rows.sort(key=lambda r: r["Compétence"].casefold())
    with out.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["Compétence", "Famille", "ID export"])
        writer.writeheader()
        writer.writerows(rows)
    return len(rows)


def _axis_token(positive: str, negative: str) -> str:
    def compact(label: str) -> str:
        cleaned = re.sub(r"[^\w]+", "_", label.strip(), flags=re.UNICODE)
        return cleaned.strip("_")

    return f"{compact(positive)}_{compact(negative)}"


def _normalized_id(raw: object) -> str:
    """UUID Notion sans tirets ni casse, pour comparer les relations."""
    return str(raw or "").replace("-", "").strip().lower()


def trait_pairs(qualities: list[dict], flaws: list[dict]) -> list[tuple[str, str, str]]:
    """Axes ``(qualité, défaut, sphère)`` des bases Notion Qualités / Défauts.

    Une qualité sans défaut opposé (ou l'inverse) forme un axe à un seul pôle : la base
    reste la référence, l'axe incomplet se complète dans Notion.
    """
    flaw_by_id = {_normalized_id(f.get("notion_page_id")): f for f in flaws if isinstance(f, dict)}
    paired_flaws: set[str] = set()
    pairs: list[tuple[str, str, str]] = []
    for quality in qualities:
        if not isinstance(quality, dict) or not str(quality.get("Nom") or "").strip():
            continue
        opposite_id = _normalized_id((quality.get("values") or {}).get("Défaut opposé"))
        flaw = flaw_by_id.get(opposite_id)
        if flaw:
            paired_flaws.add(opposite_id)
        pairs.append((str(quality["Nom"]).strip(), str((flaw or {}).get("Nom") or "").strip(), "Caractère"))
    for flaw_id, flaw in flaw_by_id.items():
        if flaw_id not in paired_flaws and str(flaw.get("Nom") or "").strip():
            pairs.append(("", str(flaw["Nom"]).strip(), "Caractère"))
    pairs.sort(key=lambda p: (p[0] or p[1]).casefold())
    return pairs


def gen_traits() -> int:
    """Axes de caractère depuis les bases Notion Qualités et Défauts (synchronisées)."""
    qualities = json.loads(QUALITIES_JSON.read_text(encoding="utf-8"))
    flaws = json.loads(FLAWS_JSON.read_text(encoding="utf-8"))
    pairs = trait_pairs(qualities, flaws)

    out = UNITY / "TraitCatalog.csv"
    with out.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["Label Positif", "Label Négatif", "Axe", "Sphère"],
        )
        writer.writeheader()
        for pos, neg, sphere in pairs:
            writer.writerow(
                {
                    "Label Positif": pos,
                    "Label Négatif": neg,
                    "Axe": _axis_token(pos, neg),
                    "Sphère": sphere,
                }
            )
    return len(pairs)


def main() -> None:
    UNITY.mkdir(parents=True, exist_ok=True)
    n_skills = gen_skills()
    n_traits = gen_traits()
    print(f"SkillCatalog.csv: {n_skills} compétences")
    print(f"TraitCatalog.csv: {n_traits} axes")


if __name__ == "__main__":
    main()
