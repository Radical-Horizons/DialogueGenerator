"""Assemblage d'un export GDD local en Markdown (NotebookLM, présentations).

Regroupe les JSON synchronisés depuis Notion en un petit nombre de fichiers texte
lisibles (plutôt que des centaines de shards bruts).
"""
from __future__ import annotations

import json
import re
import unicodedata
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Literal, Mapping, Optional, Tuple

ExportScope = Literal["disk", "sync"]

from services.gdd_notion_sync_mirror import GDD_RESERVED_TOP_LEVEL
from services.gdd_notion_sync_utils import category_file_matches_included, category_stem_to_list_category_key
from services.gdd_paths import resolve_gdd_categories_path
from services.gdd_relation_resolver import (
    build_global_relation_index,
    looks_like_notion_uuid,
    parse_relation_tokens,
)
from services.gdd_notion_sync_utils import normalize_notion_id

_MAX_FILES_DEFAULT = 64
# NotebookLM : ~500 000 mots / source (~3 M caractères FR) ; marge sous le plafond officiel.
_MAX_EXPORT_CHARS_PER_PART = 3_000_000
# Garde-fou : fichiers de suite (part02…) ; doit rester < ``_MAX_FILES_DEFAULT``.
_MAX_PARTS_PER_BUCKET = 48
# En dessous : fusionner avec le voisin plutôt que livrer un fichier quasi vide.
_MIN_STANDALONE_FILE_CHARS = 120_000

_RE_SPLIT_FICHIER = re.compile(r"(?=\n## Fichier : )")
_RE_SPLIT_RECORD = re.compile(r"(?=\n## \d+\.\s)")


def _fold_stem(stem: str) -> str:
    """Stem normalisé (accents → ASCII) en minuscules pour comparaisons."""
    nk = unicodedata.normalize("NFKD", (stem or "").strip())
    return "".join(c for c in nk if not unicodedata.combining(c)).lower()


def _is_notion_skill_page(category_file: str) -> bool:
    """True si ``category_file`` correspond à une page Skill Notion IA (détection par nom).

    Ces pages (``Skills.json``, ``Skill___Initialisation.json``, ``Gestion_de_*.json``,
    etc.) sont des outils internes pour l'IA Notion et ne contiennent pas de
    contenu GDD narratif.  Elles doivent être exclues de tous les exports.

    Détection basée sur le stem normalisé :
    - Préfixe ``"skill"``  → ``Skills.json``, ``Skill___Initialisation.json`` …
    - Préfixe ``"gestion_"`` → ``Gestion_de_personnages.json``, ``Gestion_de_Lieux.json`` …

    Note : ``Compétences.json`` et ``Compétences_de_perso.json`` (données de jeu) ne
    commencent pas par ``"skill"`` ou ``"gestion_"`` et ne sont pas affectés.
    La détection par contenu (``_is_notion_skill_content``) complète ce filtre pour
    les pages skill aux noms arbitraires (ex. ``Recherche_Deep_Dive.json``).

    Args:
        category_file: Nom de fichier ou chemin de catégorie (ex. ``"Skills.json"``).

    Returns:
        ``True`` si la catégorie doit être exclue des exports.
    """
    folded = _fold_stem(Path(category_file).stem)
    return folded.startswith("skill") or folded.startswith("gestion_")


# Signatures de section présentes dans les pages skill Notion IA.
# Un match sur l'une OU l'autre suffit à classer la page comme skill.
# - quand_utiliser_ce_skill : présent dans la majorité des skills (= "when to use this skill")
# - preamble + outils_requis : combinaison universelle dans tous les skills (y compris anciens)
_SKILL_SECTION_KEYS_ANY = frozenset({"quand_utiliser_ce_skill"})
_SKILL_SECTION_KEYS_ALL = frozenset({"preamble", "outils_requis"})


def _is_notion_skill_content(path: Path) -> bool:
    """True si le fichier (ou le premier shard du dossier) contient la signature skill Notion IA.

    Deux critères (l'un OU l'autre suffit) :
    - Présence de ``quand_utiliser_ce_skill`` dans les clés de sections (normalisées).
    - Présence simultanée de ``preamble`` ET ``outils_requis`` dans les clés de sections.

    Ces structures n'apparaissent pas dans du contenu narratif GDD.  Cette
    détection par contenu complète ``_is_notion_skill_page`` pour les pages dont le
    nom ne suit pas la convention ``skill``/``gestion_``.

    Args:
        path: Chemin vers le fichier JSON monolithe ou le dossier de shards.

    Returns:
        ``True`` si la signature skill est détectée.
    """
    try:
        if path.is_dir():
            candidates = sorted(path.glob("*.json"))
            if not candidates:
                return False
            target = candidates[0]
        elif path.is_file():
            target = path
        else:
            return False
        raw = json.loads(target.read_text(encoding="utf-8"))
        records: List[Any] = raw if isinstance(raw, list) else [raw]
        for record in records:
            if not isinstance(record, dict):
                continue
            sections = record.get("sections")
            if not isinstance(sections, dict):
                continue
            normalized_keys = {_fold_stem(str(k)) for k in sections}
            if normalized_keys & _SKILL_SECTION_KEYS_ANY:
                return True
            if _SKILL_SECTION_KEYS_ALL.issubset(normalized_keys):
                return True
    except (OSError, json.JSONDecodeError, ValueError):
        pass
    return False


def _resolve_category_path(gdd_root: Path, category_file: str) -> Path:
    """Chemin live (fichier monolithe ou dossier shards) pour un ``category_file``."""
    root = gdd_root.resolve()
    raw = (category_file or "").strip()
    stem = Path(raw).stem
    sk = category_stem_to_list_category_key(stem)
    if sk:
        return (root / sk).resolve()
    return (root / raw).resolve()


def eligible_disk_category_files(
    settings: Mapping[str, Any],
    gdd_root: Path,
) -> List[str]:
    """Sources page/database configurées ayant au moins un JSON sur disque.

    Ignore ``included_categories`` : exporte tout le GDD local disponible pour
    les sources Notion déclarées.  Les pages Skill Notion IA sont exclues :
    - par nom (``Skills.json``, ``Gestion_de_*.json``…)
    - par contenu (section ``quand_utiliser_ce_skill`` détectée dans le JSON).
    """
    sources = settings.get("sources") or []
    root = gdd_root.resolve()
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
        if _is_notion_skill_page(cf):
            continue
        target = _resolve_category_path(root, cf)
        if not _iter_json_files(target):
            continue
        if _is_notion_skill_content(target):
            continue
        seen.add(cf)
        out.append(cf)
    return out


def eligible_sync_category_files(
    settings: Mapping[str, Any],
    gdd_root: Optional[Path] = None,
) -> List[str]:
    """Noms ``category_file`` des sources page/database dans le périmètre ``included_categories``.

    Les pages Skill Notion IA sont exclues indépendamment du périmètre coché :
    - par nom (``Skills.json``, ``Gestion_de_*.json``…)
    - par contenu si ``gdd_root`` est fourni (section ``quand_utiliser_ce_skill``).
    """
    sources = settings.get("sources") or []
    inc = settings.get("included_categories") or []
    root = gdd_root.resolve() if gdd_root is not None else None
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
        if _is_notion_skill_page(cf):
            continue
        if not category_file_matches_included(cf, inc):
            continue
        if root is not None:
            target = _resolve_category_path(root, cf)
            if _is_notion_skill_content(target):
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


def _resolve_relation_string(value: str, relation_index: Dict[str, str]) -> str:
    """Résout les UUID Notion dans une chaîne séparée par virgules/points-virgules.

    Si aucun token n'est un UUID Notion, retourne la valeur inchangée.
    Les UUID non trouvés dans l'index sont conservés tels quels.

    Args:
        value: Valeur brute (ex : ``"uuid1, uuid2"`` ou texte libre).
        relation_index: Index ``{uuid_normalisé: Nom}`` cross-catégorie.

    Returns:
        Chaîne avec les UUID remplacés par leurs noms.
    """
    tokens = parse_relation_tokens(value)
    if not tokens or not any(looks_like_notion_uuid(t) for t in tokens):
        return value
    resolved = []
    for token in tokens:
        if looks_like_notion_uuid(token):
            try:
                key = normalize_notion_id(token)
                name = relation_index.get(key)
                resolved.append(name if name else token)
            except ValueError:
                resolved.append(token)
        else:
            resolved.append(token)
    return ", ".join(resolved)


def _render_value_lines(key: str, val: Any, relation_index: Dict[str, str]) -> List[str]:
    """Génère les lignes Markdown ``### key\\n value`` pour un champ scalaire ou structuré."""
    if val in (None, "", {}, []):
        return []
    lines: List[str] = [f"### {key}\n"]
    if isinstance(val, str):
        resolved = _resolve_relation_string(val, relation_index) if relation_index else val
        lines.append(resolved.strip() + "\n\n")
    elif isinstance(val, (dict, list)):
        lines.append(
            "```json\n"
            + _markdown_escape_fence(json.dumps(val, ensure_ascii=False, indent=2))
            + "\n```\n\n"
        )
    else:
        lines.append(str(val) + "\n\n")
    return lines


def _record_to_markdown(
    record: Any,
    index: int,
    relation_index: Optional[Dict[str, str]] = None,
) -> str:
    """Convertit un enregistrement GDD en bloc Markdown numéroté.

    Args:
        record: Enregistrement JSON (dict ou valeur primitive/liste).
        index: Numéro d'ordre dans la catégorie (1-based).
        relation_index: Index cross-catégorie UUID → Nom pour résoudre les champs relation.
    """
    _idx: Dict[str, str] = relation_index or {}
    title = _pick_title(record)
    lines = [f"## {index}. {title}\n"]
    if isinstance(record, dict):
        body = _sections_to_markdown(record)
        if body:
            lines.append(body)
        skip = {"sections", "section_titles"}
        for k, v in record.items():
            if k in skip:
                continue
            if v in (None, "", {}, []):
                continue
            if k == "values" and isinstance(v, dict):
                for vk, vv in v.items():
                    lines.extend(_render_value_lines(vk, vv, _idx))
                continue
            lines.extend(_render_value_lines(k, v, _idx))
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
    # 1 personnages & cultures (taxonomie biologique = règnes / classes / espèces)
    if folded in {
        "personnages",
        "personnages_(stats)",
        "personas",
        "communautes",
        "especes",
        "regnes_et_classes",
        "regnes_et_especes",
        "memoires_des_personas",
        "evaluation_des_aspects_culturels___etudes",
    } or folded.startswith("regnes"):
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
    _Bucket(
        1,
        "02-personnages-cultures",
        "Personnages & cultures",
        "PNJ, personas, espèces, règnes / classes taxonomiques, communautés…",
    ),
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


def _hard_split_at_newlines(text: str, max_len: int) -> List[str]:
    """Découpe ``text`` en morceaux d'au plus ``max_len`` caractères, de préférence sur des sauts de ligne."""
    if max_len < 512:
        max_len = 512
    text = text.rstrip("\n")
    if not text:
        return []
    out: List[str] = []
    i = 0
    n = len(text)
    while i < n:
        end = min(i + max_len, n)
        if end < n:
            cut = text.rfind("\n", i + max_len // 2, end)
            if cut <= i:
                cut = end
            end = cut + 1 if cut > i else end
        chunk = text[i:end]
        out.append(chunk if chunk.endswith("\n") else chunk + "\n")
        i = end
    return out


def _split_segment_under_limit(segment: str, max_len: int) -> List[str]:
    """Morcelle un bloc Markdown (typiquement une source ``# Base :``) pour respecter ``max_len``."""
    segment = segment.strip("\n")
    if not segment:
        return []
    if len(segment) <= max_len:
        return [segment if segment.endswith("\n") else segment + "\n"]
    hunks = _RE_SPLIT_FICHIER.split(segment)
    if len(hunks) > 1:
        merged: List[str] = []
        for h in hunks:
            h = h.strip("\n")
            if not h:
                continue
            merged.extend(_split_segment_under_limit(h + "\n", max_len))
        return merged
    hunks_r = _RE_SPLIT_RECORD.split(segment)
    if len(hunks_r) > 1:
        merged_r: List[str] = []
        for h in hunks_r:
            h = h.strip("\n")
            if not h:
                continue
            merged_r.extend(_split_segment_under_limit(h + "\n", max_len))
        return merged_r
    return _hard_split_at_newlines(segment, max_len)


def _bucket_part_filename(slug: str, part_index: int) -> str:
    """Nom de fichier pour la partie ``part_index`` (1-based) d'un bucket."""
    if part_index <= 1:
        return f"{slug}.md"
    return f"{slug}-part{part_index:02d}.md"


@dataclass
class _ThematicChunk:
    """Morceau Markdown prêt à être fusionné ou livré tel quel."""

    bucket_order: int
    bucket_slug: str
    bucket_title: str
    filename: str
    body: str


def _slug_thematic_suffix(slug: str) -> str:
    """Partie thématique d'un slug ``NN-nom`` (sans préfixe numérique)."""
    parts = slug.split("-", 1)
    return parts[1] if len(parts) == 2 else slug


def _merged_filename(slugs: List[str], part_index: int) -> str:
    """Nom de fichier pour une fusion de plusieurs thèmes."""
    if not slugs:
        return _bucket_part_filename("gdd-export", part_index)
    if len(slugs) == 1:
        return _bucket_part_filename(slugs[0], part_index)
    base = slugs[0]
    extras = [_slug_thematic_suffix(s) for s in slugs[1:]]
    merged_base = base + "".join(f"-et-{e}" for e in extras)
    return _bucket_part_filename(merged_base, part_index)


def _build_category_segments(
    gdd_root: Path,
    category_files: List[str],
    relation_index: Optional[Dict[str, str]] = None,
) -> List[str]:
    """Segments Markdown (une entrée par ``category_file``)."""
    segments: List[str] = []
    for cf in sorted(set(category_files)):
        seg_lines: List[str] = [f"---\n\n# Base : {Path(cf).stem}\n\n"]
        target = _resolve_category_path(gdd_root, cf)
        json_files = _iter_json_files(target)
        if not json_files:
            seg_lines.append("*(Aucun fichier JSON sur disque pour cette source.)*\n\n")
            segments.append("".join(seg_lines))
            continue
        for jf in json_files:
            rel = jf.relative_to(gdd_root).as_posix()
            seg_lines.append(f"## Fichier : `{rel}`\n\n")
            recs = _load_json_records(jf)
            if not recs:
                seg_lines.append("*(JSON vide ou invalide.)*\n\n")
                continue
            for idx, rec in enumerate(recs, start=1):
                seg_lines.append(_record_to_markdown(rec, idx, relation_index=relation_index))
        segments.append("".join(seg_lines))
    return segments


def _is_volume_split_part(filename: str) -> bool:
    """True si le fichier est déjà une suite découpée (``-part02.md``)."""
    return "-part" in filename.removesuffix(".md")


def _coalesce_thematic_chunks(
    chunks: List[_ThematicChunk],
    *,
    max_chars: int,
) -> List[Tuple[str, str]]:
    """Fusionne les morceaux voisins pour réduire le nombre de fichiers livrés.

    Les thèmes vides sont omis en amont. Les petits fichiers (< ``_MIN_STANDALONE_FILE_CHARS``)
    sont absorbés par le voisin suivant (ou précédent en fin de passe) tant que la limite
    NotebookLM n'est pas dépassée. Les suites ``-part02`` d'un gros thème ne sont jamais fusionnées.
    """
    if not chunks:
        return []

    packed: List[Tuple[str, str]] = []
    acc_slugs: List[str] = []
    acc_body = ""

    def flush() -> None:
        nonlocal acc_body, acc_slugs
        if not acc_body.strip():
            acc_body = ""
            acc_slugs = []
            return
        packed.append((_merged_filename(acc_slugs, 1), acc_body))
        acc_body = ""
        acc_slugs = []

    for chunk in chunks:
        piece = chunk.body
        if not piece.strip():
            continue
        if _is_volume_split_part(chunk.filename):
            flush()
            packed.append((chunk.filename, piece))
            continue
        if not acc_body:
            acc_body = piece
            acc_slugs = [chunk.bucket_slug]
            continue
        separator = "\n\n---\n\n"
        if len(acc_body) + len(separator) + len(piece) <= max_chars:
            acc_body += separator + piece
            if chunk.bucket_slug not in acc_slugs:
                acc_slugs.append(chunk.bucket_slug)
            continue
        flush()
        acc_body = piece
        acc_slugs = [chunk.bucket_slug]

    flush()

    merged: List[Tuple[str, str]] = []
    idx = 0
    while idx < len(packed):
        name, body = packed[idx]
        next_item = packed[idx + 1] if idx + 1 < len(packed) else None
        if (
            len(body) < _MIN_STANDALONE_FILE_CHARS
            and next_item is not None
            and not _is_volume_split_part(name)
            and not _is_volume_split_part(next_item[0])
        ):
            next_name, next_body = next_item
            combined = body.rstrip() + "\n\n---\n\n" + next_body.lstrip()
            if len(combined) <= max_chars:
                slug_a = name.removesuffix(".md").split("-part")[0]
                slug_b = next_name.removesuffix(".md").split("-part")[0]
                merged.append(
                    (
                        _merged_filename(
                            [slug_a, slug_b] if slug_a != slug_b else [slug_a],
                            1,
                        ),
                        combined,
                    )
                )
                idx += 2
                continue
        merged.append((name, body))
        idx += 1

    return merged
    """Nom de fichier pour la partie ``part_index`` (1-based) d'un bucket."""
    if part_index <= 1:
        return f"{slug}.md"
    return f"{slug}-part{part_index:02d}.md"


def _pack_bucket_markdown_files(
    *,
    slug: str,
    first_header: str,
    continuation_header: str,
    segments: List[str],
    max_chars: int,
) -> List[Tuple[str, str]]:
    """Découpe un bucket en un ou plusieurs fichiers Markdown sans dépasser ``max_chars``."""
    hdr_budget = max(len(first_header), len(continuation_header))
    if len(first_header) >= max_chars:
        raise ValueError(
            f"L'en-tête du bucket {slug!r} (titre + Vision.json éventuel) dépasse la limite "
            f"max_chars={max_chars}. Réduisez Vision.json ou augmentez max_chars_per_part."
        )
    if max_chars <= hdr_budget + 512:
        raise ValueError("max_chars_per_part trop petit pour les en-têtes de bucket")
    max_piece = max(16_384, max_chars - hdr_budget - 128)

    flat: List[str] = []
    for seg in segments:
        flat.extend(_split_segment_under_limit(seg, max_piece))

    fixed: List[str] = []
    for p in flat:
        if len(p) <= max_piece:
            fixed.append(p)
        else:
            fixed.extend(_hard_split_at_newlines(p.rstrip("\n"), max_piece))

    files: List[Tuple[str, str]] = []
    part_index = 0
    current = first_header

    def flush_current() -> None:
        nonlocal part_index, current, files
        part_index += 1
        if part_index > _MAX_PARTS_PER_BUCKET:
            raise ValueError(
                f"Bucket {slug!r} dépasse {_MAX_PARTS_PER_BUCKET} fichiers découpés ; "
                "réduisez le périmètre sync ou augmentez la limite côté outil."
            )
        files.append((_bucket_part_filename(slug, part_index), current))
        current = continuation_header

    for piece in fixed:
        while piece:
            room = max_chars - len(current)
            if room <= 0:
                flush_current()
                continue
            take = min(room, len(piece))
            if take <= 0:
                flush_current()
                continue
            current += piece[:take]
            piece = piece[take:]
            if piece:
                flush_current()

    # Au moins un fichier si on n'a flush qu'avec du contenu ; bucket vide géré par l'appelant.
    if part_index == 0:
        flush_current()
    elif len(current) > len(continuation_header):
        flush_current()
    return files


def build_notebooklm_markdown_parts(
    *,
    gdd_root: Path,
    project_root: Path,
    settings: Mapping[str, Any],
    max_files: int = _MAX_FILES_DEFAULT,
    max_chars_per_part: int = _MAX_EXPORT_CHARS_PER_PART,
    export_scope: ExportScope = "disk",
    relation_index: Optional[Dict[str, str]] = None,
) -> List[Tuple[str, str]]:
    """Construit des documents Markdown (nom, contenu) pour export NotebookLM.

    Les thèmes sont regroupés puis fusionnés pour limiter le nombre de fichiers :
    petits volets absorbés, gros thèmes découpés seulement au-delà de ``max_chars_per_part``.

    Args:
        gdd_root: Répertoire ``GDD_categories``.
        project_root: Racine du dépôt (pour ``Vision.json``).
        settings: Paramètres sync (``sources``, ``included_categories``).
        max_files: Nombre max de fichiers ``.md`` dans le ZIP.
        max_chars_per_part: Taille max d'un fichier Markdown avant découpage.
        export_scope: ``disk`` = tout JSON local des sources ; ``sync`` = filtre
            ``included_categories`` (périmètre coché dans l'UI).
        relation_index: Index cross-catégorie UUID → Nom pour résoudre les champs relation.
            Si ``None``, construit automatiquement depuis ``gdd_root``.

    Returns:
        Liste de ``(filename.md, texte)`` triée par nom de fichier.

    Raises:
        ValueError: Si ``max_files`` < 1 ou si le découpage dépasserait ``max_files``.
    """
    if max_files < 1:
        raise ValueError("max_files doit être >= 1")
    gdd_root = gdd_root.resolve()
    _rel_idx: Dict[str, str] = (
        relation_index if relation_index is not None else build_global_relation_index(gdd_root)
    )
    if export_scope == "sync":
        eligible = eligible_sync_category_files(settings, gdd_root=gdd_root)
    else:
        eligible = eligible_disk_category_files(settings, gdd_root)
    by_bucket: List[List[str]] = [[] for _ in _BUCKETS]
    for cf in eligible:
        folded = _fold_stem(Path(cf).stem)
        by_bucket[_bucket_index_for_stem(folded)].append(cf)

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    vision = _find_vision_json(project_root)
    vision_md = ""
    vision_attached = False
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
            vision_attached = False

    thematic_chunks: List[_ThematicChunk] = []
    for bi, bucket in enumerate(_BUCKETS):
        cats = sorted(set(by_bucket[bi]))
        if not cats:
            continue

        first_lines: List[str] = [
            f"# {bucket.title}\n",
            f"*{bucket.description}*\n\n",
        ]
        if vision_md and not vision_attached:
            first_lines.append(vision_md)
            vision_attached = True
        first_header = "".join(first_lines)
        continuation_header = (
            f"# {bucket.title} (suite)\n"
            f"*Même regroupement que `{bucket.slug}.md` ; fichier découpé pour la taille "
            f"(limite ~{max_chars_per_part:,} caractères par source NotebookLM).*\n\n"
        )
        segments = _build_category_segments(gdd_root, cats, relation_index=_rel_idx)
        bucket_files = _pack_bucket_markdown_files(
            slug=bucket.slug,
            first_header=first_header,
            continuation_header=continuation_header,
            segments=segments,
            max_chars=max_chars_per_part,
        )
        for fname, body in bucket_files:
            thematic_chunks.append(
                _ThematicChunk(
                    bucket_order=bi,
                    bucket_slug=bucket.slug,
                    bucket_title=bucket.title,
                    filename=fname,
                    body=body,
                )
            )

    out = _coalesce_thematic_chunks(thematic_chunks, max_chars=max_chars_per_part)
    out.sort(key=lambda item: item[0])

    file_lines = "\n".join(f"- `{name}` — {len(text):,} caractères" for name, text in out)
    readme = (
        "# Export GDD (NotebookLM)\n\n"
        f"Généré le **{now}** à partir des fichiers locaux sous `data/GDD_categories/` "
        "(synchronisés depuis Notion).\n\n"
        "## Périmètre\n\n"
        f"- Bases / pages incluses selon la config : **{len(eligible)}** source(s).\n"
        f"- Fichiers Markdown livrés : **{len(out)}** (petits thèmes fusionnés ; gros volumes "
        f"découpés en `-part02.md` seulement si nécessaire).\n"
        f"- Taille max par fichier : **~{max_chars_per_part:,}** caractères "
        "(sous la limite NotebookLM ~500k mots / source).\n\n"
        "## Fichiers\n\n"
        f"{file_lines}\n"
    )
    if out:
        first_name, first_body = out[0]
        out[0] = (first_name, readme + "\n\n---\n\n" + first_body)
    else:
        out = [("01-gdd-export.md", readme)]

    if len(out) > max_files:
        raise ValueError(
            f"L'export nécessiterait {len(out)} fichiers Markdown (> max_files={max_files}). "
            "Augmentez le paramètre max_files de la requête."
        )
    return out


def build_gdd_notebooklm_zip_bytes(
    *,
    gdd_root: Optional[Path] = None,
    project_root: Optional[Path] = None,
    settings: Mapping[str, Any],
    max_files: int = _MAX_FILES_DEFAULT,
    export_scope: ExportScope = "disk",
    relation_index: Optional[Dict[str, str]] = None,
) -> bytes:
    """ZIP UTF-8 contenant les exports Markdown.

    Args:
        gdd_root: Répertoire ``GDD_categories`` (déduit depuis racine si omis).
        project_root: Racine du dépôt (pour ``Vision.json``).
        settings: Paramètres sync.
        max_files: Nombre max de fichiers dans le ZIP.
        export_scope: ``disk`` ou ``sync``.
        relation_index: Index UUID → Nom pré-construit (construit depuis ``gdd_root`` si ``None``).
    """
    root = project_root or Path(__file__).resolve().parent.parent
    gdd = gdd_root or resolve_gdd_categories_path(root)
    parts = build_notebooklm_markdown_parts(
        gdd_root=gdd,
        project_root=root,
        settings=settings,
        max_files=max_files,
        export_scope=export_scope,
        relation_index=relation_index,
    )
    buf = BytesIO()
    folder = "gdd-notebooklm-export"
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name, text in parts:
            zf.writestr(f"{folder}/{name}", text.encode("utf-8"))
    return buf.getvalue()
