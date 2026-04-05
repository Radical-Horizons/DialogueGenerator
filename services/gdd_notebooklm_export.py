"""Assemblage d'un export GDD local en Markdown (NotebookLM, présentations).

Regroupe les JSON synchronisés depuis Notion en un petit nombre de fichiers texte
lisibles (plutôt que des centaines de shards bruts).
"""
from __future__ import annotations

import json
import unicodedata
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Tuple

from services.gdd_notion_sync_mirror import GDD_RESERVED_TOP_LEVEL
from services.gdd_notion_sync_utils import category_file_matches_included, category_stem_to_list_category_key
from services.gdd_paths import resolve_gdd_categories_path

_MAX_FILES_DEFAULT = 10
_MAX_EXPORT_CHARS_PER_PART = 1_800_000


def _fold_stem(stem: str) -> str:
    """Stem normalisé (accents → ASCII) en minuscules pour comparaisons."""
    nk = unicodedata.normalize("NFKD", (stem or "").strip())
    return "".join(c for c in nk if not unicodedata.combining(c)).lower()


def _resolve_category_path(gdd_root: Path, category_file: str) -> Path:
    """Chemin live (fichier monolithe ou dossier shards) pour un ``category_file``."""
    root = gdd_root.resolve()
    raw = (category_file or "").strip()
    stem = Path(raw).stem
    sk = category_stem_to_list_category_key(stem)
    if sk:
        return (root / sk).resolve()
    return (root / raw).resolve()


def eligible_sync_category_files(settings: Mapping[str, Any]) -> List[str]:
    """Noms ``category_file`` des sources page/database dans le périmètre ``included_categories``."""
    sources = settings.get("sources") or []
    inc = settings.get("included_categories") or []
    out: List[str] = []
    seen: set[str] = set()
    for s in sources:
        if not isinstance(s, dict):
            continue
        kind = (s.get("kind") or "").strip().lower()
        if kind not in ("database", "page"):
            continue
        cf = (s.get("category_file") or "").strip()
        if not cf or cf in seen:
            continue
        if not category_file_matches_included(cf, inc):
            continue
        seen.add(cf)
        out.append(cf)
    return out


def _find_vision_json(project_root: Path) -> Optional[Path]:
    """Résout ``Vision.json`` comme ``GDDLoader`` (dossier ou fichier via ``GDD_IMPORT_PATH``)."""
    import os

    env = os.getenv("GDD_IMPORT_PATH", "").strip()
    if env:
        base = Path(env)
        if base.is_file() and base.name.lower() == "vision.json":
            return base
        cand = base / "Vision.json"
        if cand.is_file():
            return cand
    default = project_root / "data" / "Vision.json"
    if default.is_file():
        return default
    return None


def _iter_json_files(target: Path) -> List[Path]:
    """Liste les JSON pour une cible sync (fichier unique ou répertoire de shards)."""
    if not target.exists():
        return []
    if target.is_file():
        return [target] if target.suffix.lower() == ".json" else []
    if not target.is_dir():
        return []
    if target.name in GDD_RESERVED_TOP_LEVEL:
        return []
    files = sorted(p for p in target.rglob("*.json") if p.is_file())
    return files


def _pick_title(record: Any) -> str:
    if isinstance(record, dict):
        for key in ("Nom", "Name", "Titre", "title", "nom"):
            v = record.get(key)
            if isinstance(v, str) and v.strip():
                return v.strip()
        nid = record.get("notion_page_id")
        if isinstance(nid, str) and nid.strip():
            return f"Fiche {nid.strip()[:8]}…"
    return "Entrée"


def _markdown_escape_fence(text: str) -> str:
    """Évite de casser un fence Markdown triple backtick."""
    return text.replace("```", "``\\`")


def _sections_to_markdown(record: Mapping[str, Any]) -> str:
    sections = record.get("sections")
    titles = record.get("section_titles")
    if not isinstance(sections, dict):
        return ""
    lines: List[str] = []
    st: Dict[str, str] = titles if isinstance(titles, dict) else {}
    for key, body in sections.items():
        if not isinstance(key, str):
            continue
        label = st.get(key) if isinstance(st.get(key), str) else key
        lines.append(f"### {label}\n")
        if isinstance(body, str) and body.strip():
            lines.append(body.strip() + "\n\n")
        elif body is not None:
            lines.append(
                "```json\n"
                + _markdown_escape_fence(
                    json.dumps(body, ensure_ascii=False, indent=2),
                )
                + "\n```\n\n"
            )
    return "".join(lines)


def _record_to_markdown(record: Any, index: int) -> str:
    title = _pick_title(record)
    lines = [f"## {index}. {title}\n"]
    if isinstance(record, dict):
        body = _sections_to_markdown(record)
        if body:
            lines.append(body)
        skip = {"sections", "section_titles", "values"}
        for k, v in record.items():
            if k in skip:
                continue
            if v in (None, "", {}, []):
                continue
            lines.append(f"### {k}\n")
            if isinstance(v, (dict, list)):
                lines.append(
                    "```json\n"
                    + _markdown_escape_fence(json.dumps(v, ensure_ascii=False, indent=2))
                    + "\n```\n\n"
                )
            elif isinstance(v, str):
                lines.append(v.strip() + "\n\n")
            else:
                lines.append(str(v) + "\n\n")
        return "".join(lines)
    lines.append(
        "```json\n"
        + _markdown_escape_fence(json.dumps(record, ensure_ascii=False, indent=2))
        + "\n```\n\n"
    )
    return "".join(lines)


def _load_json_records(path: Path) -> List[Any]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if isinstance(raw, list):
        return raw
    return [raw]


def _bucket_index_for_stem(folded: str) -> int:
    """Index 0..7 (8 regroupements + README = 9 fichiers max)."""
    # 0 univers / narration
    if folded in {
        "bible_narrative",
        "chapitres",
        "chronologie_d'escelion",
        "chronologie_d_escelion",
        "piliers",
        "structure_narrative",
        "structure_narrative_en_spirale",
        "scenarios",
        "scenario",
        "actes",
        "inspirations",
    }:
        return 0
    # 1 personnages & cultures
    if folded in {
        "personnages",
        "personnages_(stats)",
        "personas",
        "communautes",
        "especes",
        "memoires_des_personas",
        "evaluation_des_aspects_culturels___etudes",
    }:
        return 1
    # 2 monde & lieux
    if folded in {
        "lieux",
        "maps",
        "langues",
        "noms",
        "objets",
        "inventaires_pnj",
    }:
        return 2
    # 3 systèmes & gameplay
    if folded in {
        "systemes_de_jeu",
        "competences",
        "competences_de_perso",
        "flags",
        "feuilles_de_perso",
        "caracteristiques___uresair_(fp)",
        "quetes",
    }:
        return 3
    # 4 dialogues & quêtes narratives
    if folded in {"dialogues", "scenes"}:
        return 4
    # 5 direction narrative / guides
    if folded.startswith("guide") or folded in {
        "guides",
        "narrative_design",
        "guide_de_narration",
        "guide_des_dialogues",
        "guide_des_quetes_annexes",
        "lentilles_du_game_designer",
        "table_des_patterns",
        "methodologie_des_boucles_experientielles_(mcwills)",
        "prompts_pour_ia",
        "prompt_engineering",
        "bibliotheque_de_prompts",
        "initialisation_creative",
    }:
        return 5
    # 6 art, audio, direction artistique
    if folded in {
        "musiques",
        "guides_musicaux_par_lieux",
        "lexique_musical",
        "lexique_de_termes_musicaux",
        "sound_design",
        "assets_visuels",
        "references_visuelles_des_elements_originaux",
        "direction_artistique",
        "visual_guides",
    }:
        return 6
    # 7 production, références & autres sources
    return 7


@dataclass(frozen=True)
class _Bucket:
    order: int
    slug: str
    title: str
    description: str


_BUCKETS: Tuple[_Bucket, ...] = (
    _Bucket(0, "01-univers-narratif", "Univers & narration", "Bible, chapitres, chronologie, structure…"),
    _Bucket(1, "02-personnages-cultures", "Personnages & cultures", "PNJ, personas, espèces, communautés…"),
    _Bucket(2, "03-monde-lieux", "Monde, lieux & objets", "Lieux, cartes, langues, objets…"),
    _Bucket(3, "04-systemes-gameplay", "Systèmes & gameplay", "Règles, compétences, flags, fiches perso…"),
    _Bucket(4, "05-dialogues-scenes", "Dialogues & scènes", "Lignes de dialogue et scènes"),
    _Bucket(5, "06-guides-narration", "Guides & narration", "Guides de craft, patterns, prompts…"),
    _Bucket(6, "07-art-audio", "Art, audio & DA", "Musique, sound design, références visuelles…"),
    _Bucket(
        7,
        "08-production-et-autres",
        "Production, références & autres",
        "Tests, vocabulaire, fiches « Référence », et bases non classées ailleurs",
    ),
)


def _maybe_truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return (
        text[:limit]
        + "\n\n---\n\n**[Export tronqué]** Le contenu dépasse la limite de caractères "
        f"({limit}). Réduisez le périmètre (filtre bases Notion) ou exportez une base précise via l’API.\n"
    )


def build_notebooklm_markdown_parts(
    *,
    gdd_root: Path,
    project_root: Path,
    settings: Mapping[str, Any],
    max_files: int = _MAX_FILES_DEFAULT,
    max_chars_per_part: int = _MAX_EXPORT_CHARS_PER_PART,
) -> List[Tuple[str, str]]:
    """Construit jusqu’à ``max_files`` documents Markdown (nom, contenu).

    Args:
        gdd_root: Répertoire ``GDD_categories``.
        project_root: Racine du dépôt (pour ``Vision.json``).
        settings: Paramètres sync (``sources``, ``included_categories``).
        max_files: Nombre max de fichiers (défaut 10).
        max_chars_per_part: Troncature par fichier si dépassé.

    Returns:
        Liste de ``(filename.md, texte)`` triée par nom de fichier.

    Raises:
        ValueError: Si ``max_files`` < 1.
    """
    if max_files < 1:
        raise ValueError("max_files doit être >= 1")
    gdd_root = gdd_root.resolve()
    eligible = eligible_sync_category_files(settings)
    by_bucket: List[List[str]] = [[] for _ in _BUCKETS]
    for cf in eligible:
        folded = _fold_stem(Path(cf).stem)
        by_bucket[_bucket_index_for_stem(folded)].append(cf)

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    readme = (
        "# Export GDD (NotebookLM)\n\n"
        f"Généré le **{now}** à partir des fichiers locaux sous `data/GDD_categories/` "
        "(synchronisés depuis Notion).\n\n"
        "## Périmètre\n\n"
        f"- Bases / pages incluses selon la config : **{len(eligible)}** source(s).\n"
        f"- Fichiers livrés : **{max_files}** maximum (regroupements thématiques).\n\n"
        "## Fichiers\n\n"
    )
    for b in _BUCKETS:
        readme += f"- `{b.slug}.md` — {b.title}\n"
    readme += "\n---\n\n*(Les sections suivantes sont vides si aucune source ne correspond.)*\n"

    parts: Dict[str, str] = {"00-README.md": readme}

    vision = _find_vision_json(project_root)
    vision_md = ""
    if vision and vision.is_file():
        try:
            data = json.loads(vision.read_text(encoding="utf-8"))
            vision_md = (
                "## Vision (Vision.json)\n\n```json\n"
                + _markdown_escape_fence(json.dumps(data, ensure_ascii=False, indent=2))
                + "\n```\n\n"
            )
        except (OSError, json.JSONDecodeError):
            vision_md = "## Vision (Vision.json)\n\n*(Fichier présent mais illisible.)*\n\n"

    for bi, bucket in enumerate(_BUCKETS):
        chunk_lines: List[str] = [
            f"# {bucket.title}\n",
            f"*{bucket.description}*\n\n",
        ]
        if bi == 0 and vision_md:
            chunk_lines.append(vision_md)
        cats = sorted(set(by_bucket[bi]))
        if not cats:
            chunk_lines.append("*(Aucune source dans cette catégorie pour le périmètre actuel.)*\n")
            parts[f"{bucket.slug}.md"] = _maybe_truncate("".join(chunk_lines), max_chars_per_part)
            continue

        for cf in cats:
            target = _resolve_category_path(gdd_root, cf)
            json_files = _iter_json_files(target)
            stem = Path(cf).stem
            chunk_lines.append(f"---\n\n# Base : {stem}\n\n")
            if not json_files:
                chunk_lines.append("*(Aucun fichier JSON sur disque pour cette source.)*\n\n")
                continue
            for jf in json_files:
                rel = jf.relative_to(gdd_root).as_posix()
                chunk_lines.append(f"## Fichier : `{rel}`\n\n")
                recs = _load_json_records(jf)
                if not recs:
                    chunk_lines.append("*(JSON vide ou invalide.)*\n\n")
                    continue
                for idx, rec in enumerate(recs, start=1):
                    chunk_lines.append(_record_to_markdown(rec, idx))

        parts[f"{bucket.slug}.md"] = _maybe_truncate("".join(chunk_lines), max_chars_per_part)

    ordered_names = ["00-README.md"] + [b.slug + ".md" for b in _BUCKETS]
    out: List[Tuple[str, str]] = [(n, parts[n]) for n in ordered_names if n in parts]
    if len(out) > max_files:
        out = out[:max_files]
    return out


def build_gdd_notebooklm_zip_bytes(
    *,
    gdd_root: Optional[Path] = None,
    project_root: Optional[Path] = None,
    settings: Mapping[str, Any],
    max_files: int = _MAX_FILES_DEFAULT,
) -> bytes:
    """ZIP UTF-8 contenant les exports Markdown."""
    root = project_root or Path(__file__).resolve().parent.parent
    gdd = gdd_root or resolve_gdd_categories_path(root)
    parts = build_notebooklm_markdown_parts(
        gdd_root=gdd,
        project_root=root,
        settings=settings,
        max_files=max_files,
    )
    buf = BytesIO()
    folder = "gdd-notebooklm-export"
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name, text in parts:
            zf.writestr(f"{folder}/{name}", text.encode("utf-8"))
    return buf.getvalue()
