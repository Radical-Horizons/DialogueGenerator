"""Génère SkillCatalog.csv / TraitCatalog.csv depuis le GDD (one-shot)."""
from __future__ import annotations

import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UNITY = ROOT / "data" / "UnityData"
SKILLS_JSON = ROOT / "data" / "GDD_categories" / "Compétences.json"
TRAITS_JSON = (
    ROOT
    / "data"
    / "GDD_categories"
    / "systemes_de_jeu"
    / "Traits_de_caractere_946f4ed8-52b4-4e1d-b8d0-91e2d5d350d3.json"
)


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


def gen_traits() -> int:
    """Axes bipolaires documentés + paires seed pour le prompt LLM."""
    pairs: list[tuple[str, str, str]] = []
    if TRAITS_JSON.exists():
        data = json.loads(TRAITS_JSON.read_text(encoding="utf-8"))
        text = str((data.get("values") or {}).get("2__axes_bipolaires") or "")
        def _cell(raw: str) -> str:
            return re.sub(r"[*]+", "", raw).strip()

        for axe, neg, pos in re.findall(
            r"<tr>\s*<td>\s*([^<]+?)\s*</td>\s*<td>\s*([^<]+?)\s*</td>\s*<td>\s*([^<]+?)\s*</td>",
            text,
            flags=re.IGNORECASE,
        ):
            axe_l, neg_l, pos_l = _cell(axe), _cell(neg), _cell(pos)
            if not axe_l or axe_l.casefold() == "axe":
                continue
            if pos_l.casefold().startswith("pôle +") or neg_l.casefold().startswith("pôle"):
                continue
            # Table: Axe | Pôle -100 | Pôle +100
            pairs.append((pos_l, neg_l, "Caractère"))

    # Seed minimal si parsing vide / complément utile pour prompts
    seed = [
        ("Courage", "Lâcheté", "Caractère"),
        ("Empathie", "Cruauté", "Caractère"),
        ("Prudence", "Imprudence", "Caractère"),
        ("Discrétion", "Indiscrétion", "Caractère"),
        ("Stabilité", "Instabilité", "Caractère"),
        ("Diplomate", "Provocateur", "Social"),
        ("Loyal", "Traître", "Moral"),
        ("Honnête", "Menteur", "Moral"),
        ("Généreux", "Avare", "Moral"),
        ("Patient", "Impulsif", "Caractère"),
    ]
    seen = {(p.casefold(), n.casefold()) for p, n, _ in pairs}
    for pos, neg, sphere in seed:
        key = (pos.casefold(), neg.casefold())
        if key not in seen:
            pairs.append((pos, neg, sphere))
            seen.add(key)

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
