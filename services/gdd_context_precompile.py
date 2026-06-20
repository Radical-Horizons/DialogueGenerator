"""Précompilation disque des fiches de contexte GDD (ContextItem + tokens tiktoken).

Artefacts sous ``data/.gdd_context_precompile/``. Bootstrap manuel ou mise à jour
incrémentale via sync Notion ; recompilation on-the-fly en cas de miss.
"""
from __future__ import annotations

import copy
import hashlib
import json
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, TYPE_CHECKING

from models.prompt_structure import ContextCategory, ContextItem, PromptMetadata, PromptSection, PromptStructure
from services.gdd_notion_atomic_io import read_json_file, write_json_atomic
from services.context_token_reconciler import reconcile_prompt_structure_token_counts

if TYPE_CHECKING:
    from core.context.context_builder import ContextBuilder
    from services.context_construction_service import ContextConstructionService
    from services.gdd_loader import GDDData, GDDLoader

logger = logging.getLogger(__name__)

SCHEMA_VERSION = 2
_PRECOMPILE_ROOT = Path("data") / ".gdd_context_precompile"
_ORGANIZATION_MODES = ("narrative", "default", "minimal")
_ELEMENT_MODES = ("full", "excerpt")
_STANDARD_FIELDS_PROFILE = "standard"

# stem GDD_categories → clé sélection API
STEM_TO_CATEGORY_KEY: Dict[str, str] = {
    "personnages": "characters",
    "lieux": "locations",
    "objets": "items",
    "especes": "species",
    "communautes": "communities",
    "dialogues": "dialogues_examples",
    "structure_narrative": "narrative_structures",
    "chapitres": "chapters",
    "scènes": "scenes",
    "scenes": "scenes",
    "quetes": "quests",
}

CATEGORY_KEY_TO_STEM: Dict[str, str] = {v: k for k, v in STEM_TO_CATEGORY_KEY.items()}

_lazy_precompile_builder: Optional["ContextBuilder"] = None


def get_or_create_precompile_context_builder(*, reload: bool = False) -> "ContextBuilder":
    """ContextBuilder partagé pour précompilation (sync batch, script bootstrap)."""
    global _lazy_precompile_builder
    if _lazy_precompile_builder is None:
        from core.context.context_builder import ContextBuilder

        _lazy_precompile_builder = ContextBuilder()
        _lazy_precompile_builder.load_gdd_files()
    elif reload:
        _lazy_precompile_builder.load_gdd_files()
    return _lazy_precompile_builder


def clear_precompile_context_builder() -> None:
    """Invalide le builder lazy (après mutation disque GDD)."""
    global _lazy_precompile_builder
    _lazy_precompile_builder = None


@dataclass(frozen=True)
class PrecompiledFicheVariant:
    """Une variante précompilée (org × mode × profil champs)."""

    context_item: Dict[str, Any]
    serialized_item_text: str
    token_count: int
    fields_used: List[str]
    compiled_at: str


def precompile_root(repo_root: Optional[Path] = None) -> Path:
    """Répertoire racine du cache de précompilation."""
    if repo_root is None:
        from core.context.context_builder import PROJECT_ROOT_DIR

        repo_root = Path(PROJECT_ROOT_DIR)
    return repo_root / _PRECOMPILE_ROOT


def _safe_entity_key(name: str) -> str:
    """Nom de fichier sûr à partir du champ ``Nom`` GDD."""
    raw = (name or "unknown").strip() or "unknown"
    safe = re.sub(r"[^\w\-.]+", "_", raw, flags=re.UNICODE)
    return safe[:120] if len(safe) > 120 else safe


def compute_content_hash(record: Dict[str, Any]) -> str:
    """Empreinte SHA-256 stable du record GDD brut."""
    canonical = json.dumps(record, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def variant_cache_key(
    organization_mode: str,
    element_mode: str,
    fields_profile_id: str,
) -> str:
    """Clé de variante dans le fichier entité."""
    return f"{organization_mode}:{element_mode}:{fields_profile_id}"


def resolve_fields_profile_id(
    field_configs: Optional[Dict[str, List[str]]],
) -> str:
    """Identifiant du profil champs (standard ou custom hash)."""
    if not field_configs:
        return _STANDARD_FIELDS_PROFILE
    normalized: Dict[str, List[str]] = {}
    for element_type, paths in sorted(field_configs.items()):
        if not paths:
            continue
        normalized[element_type] = sorted(set(paths))
    if not normalized:
        return _STANDARD_FIELDS_PROFILE
    payload = json.dumps(normalized, sort_keys=True, ensure_ascii=False)
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]
    return f"custom:{digest}"


def _entity_cache_path(
    repo_root: Path,
    category_stem: str,
    entity_name: str,
) -> Path:
    stem = re.sub(r"[^\w\-.]+", "_", category_stem.strip() or "misc", flags=re.UNICODE)[:80]
    return precompile_root(repo_root) / stem / f"{_safe_entity_key(entity_name)}.json"


def _gdd_fingerprint(repo_root: Path) -> str:
    """Empreinte du disque GDD (alignée cache runtime)."""
    from api.utils.gdd_cache import gdd_shard_directory_fingerprint

    gdd_dir = repo_root / "data" / "GDD_categories"
    try:
        if gdd_dir.is_dir():
            mmax, njson = gdd_shard_directory_fingerprint(gdd_dir)
            return f"{mmax:.9f}|{njson}"
    except OSError:
        pass
    return "0"


def _load_entity_file(path: Path) -> Optional[Dict[str, Any]]:
    """Charge le fichier cache entité ; None si absent ou invalide."""
    if not path.is_file():
        return None
    try:
        data = read_json_file(path, default=None)
    except (OSError, json.JSONDecodeError, TypeError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    if int(data.get("schema_version", 0)) != SCHEMA_VERSION:
        return None
    return data


def load_variant(
    repo_root: Path,
    category_stem: str,
    nom: str,
    organization_mode: str,
    element_mode: str,
    fields_profile_id: str,
    *,
    expected_content_hash: Optional[str] = None,
) -> Optional[PrecompiledFicheVariant]:
    """Charge une variante précompilée si fraîche."""
    path = _entity_cache_path(repo_root, category_stem, nom)
    entity_doc = _load_entity_file(path)
    if entity_doc is None:
        return None
    if expected_content_hash and entity_doc.get("content_hash") != expected_content_hash:
        return None
    variants = entity_doc.get("variants")
    if not isinstance(variants, dict):
        return None
    key = variant_cache_key(organization_mode, element_mode, fields_profile_id)
    raw = variants.get(key)
    if not isinstance(raw, dict):
        return None
    try:
        return PrecompiledFicheVariant(
            context_item=dict(raw["context_item"]),
            serialized_item_text=str(raw.get("serialized_item_text") or ""),
            token_count=int(raw.get("token_count") or 0),
            fields_used=list(raw.get("fields_used") or []),
            compiled_at=str(raw.get("compiled_at") or ""),
        )
    except (KeyError, TypeError, ValueError):
        return None


def _variant_to_dict(variant: PrecompiledFicheVariant) -> Dict[str, Any]:
    return {
        "context_item": variant.context_item,
        "serialized_item_text": variant.serialized_item_text,
        "token_count": variant.token_count,
        "fields_used": variant.fields_used,
        "compiled_at": variant.compiled_at,
    }


def save_variant(
    repo_root: Path,
    category_stem: str,
    nom: str,
    record: Dict[str, Any],
    organization_mode: str,
    element_mode: str,
    fields_profile_id: str,
    variant: PrecompiledFicheVariant,
    *,
    source_mtime_ns: Optional[int] = None,
) -> None:
    """Persiste ou met à jour une variante (écriture atomique)."""
    path = _entity_cache_path(repo_root, category_stem, nom)
    path.parent.mkdir(parents=True, exist_ok=True)
    entity_doc = _load_entity_file(path) or {}
    entity_doc.update(
        {
            "schema_version": SCHEMA_VERSION,
            "category_stem": category_stem,
            "nom": nom,
            "content_hash": compute_content_hash(record),
            "source_mtime_ns": source_mtime_ns,
            "variants": entity_doc.get("variants") if isinstance(entity_doc.get("variants"), dict) else {},
        }
    )
    key = variant_cache_key(organization_mode, element_mode, fields_profile_id)
    entity_doc["variants"][key] = _variant_to_dict(variant)
    write_json_atomic(path, entity_doc, indent=2)


def invalidate_entity(repo_root: Path, category_stem: str, nom: str) -> None:
    """Supprime le cache d'une entité."""
    path = _entity_cache_path(repo_root, category_stem, nom)
    try:
        if path.is_file():
            path.unlink()
    except OSError as exc:
        logger.warning("Impossible de supprimer le cache précompile %s: %s", path, exc)


def write_manifest(repo_root: Path, entity_count: int) -> None:
    """Écrit le manifest global après un bootstrap complet."""
    root = precompile_root(repo_root)
    root.mkdir(parents=True, exist_ok=True)
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "gdd_fingerprint": _gdd_fingerprint(repo_root),
        "entity_count": entity_count,
        "compiled_at": datetime.now(timezone.utc).isoformat(),
    }
    write_json_atomic(root / "manifest.json", manifest, indent=2)


def context_item_from_variant(
    variant: PrecompiledFicheVariant,
    *,
    element_label: str,
    idx: int,
    display_name: str,
    element_mode: str,
) -> ContextItem:
    """Rehydrate un ContextItem depuis le cache et applique id/nom de la sélection courante."""
    item = ContextItem.model_validate(copy.deepcopy(variant.context_item))
    item.id = f"{element_label}_{idx}"
    item.name = display_name
    meta = dict(item.metadata or {})
    meta["real_name"] = display_name
    meta["mode"] = element_mode
    item.metadata = meta
    return item


def _compile_single_variant(
    construction: "ContextConstructionService",
    context_builder: "ContextBuilder",
    *,
    category_key: str,
    canonical_name: str,
    element_data: Dict[str, Any],
    organization_mode: str,
    element_mode: str,
    field_configs: Optional[Dict[str, List[str]]],
) -> PrecompiledFicheVariant:
    """Compile une variante mono-fiche avec reconcile tiktoken."""
    element_type = (
        construction._element_resolver.get_element_type(category_key)
        if construction._element_resolver
        else category_key
    )
    element_label = (
        construction._element_resolver.get_element_label(category_key)
        if construction._element_resolver
        else category_key.upper()
    )
    field_manager = construction._get_field_manager()
    fields_to_include = None
    if field_configs and element_type in field_configs:
        fields_to_include = field_configs[element_type]
    fields_for_element = field_manager.get_field_config_for_mode(
        element_type,
        element_mode,
        fields_to_include,
    )
    filtered_fields = None
    field_labels_map: Dict[str, str] = {}
    if fields_for_element:
        filtered_fields = field_manager.filter_fields_by_condition_flags(
            element_type,
            fields_for_element,
            include_dialogue_type=True,
        )
        if not filtered_fields:
            raise ValueError(f"Aucun champ après filtrage pour {canonical_name}")
        field_labels_map = field_manager.get_field_labels_map(element_type, filtered_fields)

    from services.context_organizer import ContextOrganizer

    organizer = ContextOrganizer()
    context_item = construction._build_context_item(
        element_data=element_data,
        element_type=element_type,
        element_label=element_label,
        idx=1,
        name=canonical_name,
        filtered_fields=filtered_fields,
        field_labels_map=field_labels_map,
        organization_mode=organization_mode,
        element_mode=element_mode,
        organizer=organizer,
    )
    if context_item is None:
        raise ValueError(f"Fiche vide pour {canonical_name}")

    category_title = category_key.replace("_", " ").capitalize()
    structure = PromptStructure(
        sections=[
            PromptSection(
                type="context",
                title="CONTEXTE GÉNÉRAL DE LA SCÈNE",
                content="",
                tokenCount=0,
                categories=[
                    ContextCategory(
                        type=category_key,
                        title=category_title.upper(),
                        items=[context_item],
                        tokenCount=0,
                    )
                ],
            )
        ],
        metadata=PromptMetadata(
            totalTokens=0,
            generatedAt=datetime.now(timezone.utc).isoformat(),
            organizationMode=organization_mode,
        ),
    )
    reconcile_prompt_structure_token_counts(structure)
    reconciled_item = structure.sections[0].categories[0].items[0]
    serialized_text = context_builder.serialize_context_to_text(structure)
    compiled_at = datetime.now(timezone.utc).isoformat()
    return PrecompiledFicheVariant(
        context_item=reconciled_item.model_dump(),
        serialized_item_text=serialized_text,
        token_count=int(reconciled_item.tokenCount or 0),
        fields_used=list(filtered_fields or []),
        compiled_at=compiled_at,
    )


def compile_and_save_variant(
    context_builder: "ContextBuilder",
    *,
    category_stem: str,
    record: Dict[str, Any],
    organization_mode: str,
    element_mode: str,
    fields_profile_id: str,
    field_configs: Optional[Dict[str, List[str]]] = None,
    repo_root: Optional[Path] = None,
) -> PrecompiledFicheVariant:
    """Compile une variante on-the-fly et la persiste."""
    if repo_root is None:
        from core.context.context_builder import PROJECT_ROOT_DIR

        repo_root = Path(PROJECT_ROOT_DIR)
    category_key = STEM_TO_CATEGORY_KEY.get(category_stem)
    if not category_key:
        raise ValueError(f"Catégorie GDD inconnue: {category_stem}")
    nom = str(record.get("Nom") or "").strip() or "unknown"
    construction = context_builder._context_construction_service
    if construction is None:
        raise RuntimeError("ContextConstructionService non initialisé")
    effective_field_configs = None if fields_profile_id == _STANDARD_FIELDS_PROFILE else field_configs
    variant = _compile_single_variant(
        construction,
        context_builder,
        category_key=category_key,
        canonical_name=nom,
        element_data=record,
        organization_mode=organization_mode,
        element_mode=element_mode,
        field_configs=effective_field_configs,
    )
    save_variant(
        repo_root,
        category_stem,
        nom,
        record,
        organization_mode,
        element_mode,
        fields_profile_id,
        variant,
    )
    return variant


def lookup_precomputed_entity_tokens(
    context_builder: "ContextBuilder",
    entities: List[Dict[str, Any]],
    *,
    organization_mode: str,
    field_configs: Optional[Dict[str, List[str]]] = None,
) -> List[Dict[str, Any]]:
    """Lit les tokens précompilés (cache disque) pour des fiches isolées.

    Pas de rebuild global ni reconcile sur l'ensemble de la sélection — O(1) par fiche
    en cas de cache hit (bootstrap ou sync).

    Args:
        context_builder: Builder avec GDD chargé.
        entities: Liste de dicts ``entity_type``, ``name``, ``mode``.
        organization_mode: Mode narrative/default/minimal.
        field_configs: Profil champs UI ; repli sur ``standard`` si variante absente.

    Returns:
        Lignes avec token_count, cache_hit et profile_fallback.
    """
    from core.context.context_builder import PROJECT_ROOT_DIR

    construction = context_builder._context_construction_service
    if construction is None:
        raise RuntimeError("ContextConstructionService non initialisé")

    repo_root = Path(PROJECT_ROOT_DIR)
    fields_profile_id = resolve_fields_profile_id(field_configs)
    org_mode = organization_mode or "narrative"
    rows: List[Dict[str, Any]] = []

    for raw in entities:
        category_key = str(raw.get("entity_type") or "").strip()
        name = str(raw.get("name") or "").strip()
        element_mode = str(raw.get("mode") or "full").strip() or "full"
        if not category_key or not name:
            rows.append(
                {
                    "entity_type": category_key or "unknown",
                    "name": name,
                    "mode": element_mode,
                    "token_count": 0,
                    "cache_hit": False,
                    "profile_fallback": False,
                }
            )
            continue

        element_data: Optional[Dict[str, Any]] = None
        if construction._element_resolver is not None:
            element_data = construction._element_resolver.resolve_element_data(category_key, name)
        if not element_data:
            logger.warning("Précompile lookup : entité introuvable %s / %s", category_key, name)
            rows.append(
                {
                    "entity_type": category_key,
                    "name": name,
                    "mode": element_mode,
                    "token_count": 0,
                    "cache_hit": False,
                    "profile_fallback": False,
                }
            )
            continue

        canonical_name = str(element_data.get("Nom") or name)
        category_stem = CATEGORY_KEY_TO_STEM.get(category_key, category_key)
        content_hash = compute_content_hash(element_data)

        def _try_load(profile_id: str) -> Optional[PrecompiledFicheVariant]:
            return load_variant(
                repo_root,
                category_stem,
                canonical_name,
                org_mode,
                element_mode,
                profile_id,
                expected_content_hash=content_hash,
            )

        variant = _try_load(fields_profile_id)
        cache_hit = variant is not None
        profile_fallback = False

        if variant is None and fields_profile_id != _STANDARD_FIELDS_PROFILE:
            variant = _try_load(_STANDARD_FIELDS_PROFILE)
            if variant is not None:
                profile_fallback = True
                cache_hit = True

        if variant is None:
            try:
                effective_configs = (
                    None if fields_profile_id == _STANDARD_FIELDS_PROFILE else field_configs
                )
                variant = compile_and_save_variant(
                    context_builder,
                    category_stem=category_stem,
                    record=element_data,
                    organization_mode=org_mode,
                    element_mode=element_mode,
                    fields_profile_id=fields_profile_id,
                    field_configs=effective_configs,
                    repo_root=repo_root,
                )
                cache_hit = False
            except (ValueError, RuntimeError, OSError) as exc:
                logger.warning(
                    "Précompile lookup compile échouée (%s / %s): %s",
                    category_key,
                    canonical_name,
                    exc,
                )
                variant = None

        token_count = int(variant.token_count) if variant is not None else 0
        context_item_dict: Optional[Dict[str, Any]] = None
        if variant is not None:
            context_item_dict = dict(variant.context_item)
        rows.append(
            {
                "entity_type": category_key,
                "name": canonical_name,
                "mode": element_mode,
                "token_count": token_count,
                "cache_hit": cache_hit,
                "profile_fallback": profile_fallback,
                "context_item": context_item_dict,
            }
        )

    return rows


def precompile_entity(
    context_builder: "ContextBuilder",
    *,
    category_stem: str,
    record: Dict[str, Any],
    repo_root: Optional[Path] = None,
    organization_modes: Optional[List[str]] = None,
    element_modes: Optional[List[str]] = None,
    fields_profile_id: str = _STANDARD_FIELDS_PROFILE,
) -> int:
    """Précompile toutes les variantes standard pour une entité.

    Returns:
        Nombre de variantes écrites.
    """
    if repo_root is None:
        from core.context.context_builder import PROJECT_ROOT_DIR

        repo_root = Path(PROJECT_ROOT_DIR)
    org_modes = organization_modes or list(_ORGANIZATION_MODES)
    el_modes = element_modes or list(_ELEMENT_MODES)
    content_hash = compute_content_hash(record)
    nom = str(record.get("Nom") or "").strip() or "unknown"
    written = 0
    for org_mode in org_modes:
        for el_mode in el_modes:
            existing = load_variant(
                repo_root,
                category_stem,
                nom,
                org_mode,
                el_mode,
                fields_profile_id,
                expected_content_hash=content_hash,
            )
            if existing is not None:
                continue
            try:
                compile_and_save_variant(
                    context_builder,
                    category_stem=category_stem,
                    record=record,
                    organization_mode=org_mode,
                    element_mode=el_mode,
                    fields_profile_id=fields_profile_id,
                    field_configs=None,
                    repo_root=repo_root,
                )
                written += 1
            except (ValueError, RuntimeError) as exc:
                logger.warning(
                    "Précompilation ignorée (%s / %s / %s:%s): %s",
                    category_stem,
                    nom,
                    org_mode,
                    el_mode,
                    exc,
                )
    return written


def _iter_category_records(
    gdd_data: "GDDData",
    stem: str,
    cfg: Dict[str, Any],
    loader: Optional["GDDLoader"] = None,
) -> List[Dict[str, Any]]:
    """Liste les records d'une catégorie (mémoire ou repli shards disque)."""
    attr = cfg["attr"]
    records: Any = getattr(gdd_data, attr, None) or []
    if isinstance(records, list) and records:
        return [r for r in records if isinstance(r, dict)]
    if loader is not None and cfg.get("type") is list:
        shard_dir = loader._resolve_category_shard_directory(stem)
        if shard_dir is not None and shard_dir.is_dir():
            return loader.load_shard_json_records(shard_dir)
    return []


def precompile_all_entities(
    context_builder: "ContextBuilder",
    gdd_data: "GDDData",
    *,
    repo_root: Optional[Path] = None,
    category_filter: Optional[str] = None,
    dry_run: bool = False,
    force: bool = False,
) -> int:
    """Bootstrap : précompile toutes les entités list du GDD.

    Args:
        context_builder: Builder initialisé (``load_gdd_files``).
        gdd_data: Données GDD chargées.
        repo_root: Racine projet.
        category_filter: stem optionnel (ex. ``personnages``).
        dry_run: Compte sans écrire.
        force: Ignore le cache existant (recompile toutes les variantes).

    Returns:
        Nombre d'entités traitées.
    """
    if repo_root is None:
        from core.context.context_builder import PROJECT_ROOT_DIR

        repo_root = Path(PROJECT_ROOT_DIR)
    from services.gdd_loader import GDDLoader

    loader = getattr(context_builder, "_gdd_loader", None)
    entity_count = 0
    for stem, cfg in GDDLoader.CATEGORIES_CONFIG.items():
        if category_filter and stem != category_filter:
            continue
        if cfg.get("type") is not list:
            continue
        records = _iter_category_records(gdd_data, stem, cfg, loader)
        for record in records:
            nom = str(record.get("Nom") or "").strip()
            if not nom:
                continue
            entity_count += 1
            if dry_run:
                logger.info("[dry-run] Précompilerait %s / %s", stem, nom)
                continue
            if force:
                invalidate_entity(repo_root, stem, nom)
            try:
                precompile_entity(
                    context_builder,
                    category_stem=stem,
                    record=record,
                    repo_root=repo_root,
                )
            except Exception as exc:
                logger.warning("Échec précompilation %s / %s: %s", stem, nom, exc)
    if not dry_run:
        write_manifest(repo_root, entity_count)
    logger.info("Précompilation terminée : %d entités", entity_count)
    return entity_count


def try_load_cached_context_item(
    *,
    category_key: str,
    canonical_name: str,
    element_data: Dict[str, Any],
    organization_mode: str,
    element_mode: str,
    field_configs: Optional[Dict[str, List[str]]],
    element_label: str,
    idx: int,
) -> Optional[ContextItem]:
    """Tente de charger un ContextItem depuis le cache disque."""
    from core.context.context_builder import PROJECT_ROOT_DIR

    repo_root = Path(PROJECT_ROOT_DIR)
    category_stem = CATEGORY_KEY_TO_STEM.get(category_key, category_key)
    fields_profile_id = resolve_fields_profile_id(field_configs)
    content_hash = compute_content_hash(element_data)
    variant = load_variant(
        repo_root,
        category_stem,
        canonical_name,
        organization_mode,
        element_mode,
        fields_profile_id,
        expected_content_hash=content_hash,
    )
    if variant is None:
        return None
    return context_item_from_variant(
        variant,
        element_label=element_label,
        idx=idx,
        display_name=canonical_name,
        element_mode=element_mode,
    )


def persist_context_item_variant(
    context_builder: "ContextBuilder",
    *,
    category_key: str,
    record: Dict[str, Any],
    organization_mode: str,
    element_mode: str,
    field_configs: Optional[Dict[str, List[str]]],
) -> None:
    """Persiste une variante après compilation on-the-fly (miss cache)."""
    from core.context.context_builder import PROJECT_ROOT_DIR

    repo_root = Path(PROJECT_ROOT_DIR)
    category_stem = CATEGORY_KEY_TO_STEM.get(category_key, category_key)
    fields_profile_id = resolve_fields_profile_id(field_configs)
    try:
        compile_and_save_variant(
            context_builder,
            category_stem=category_stem,
            record=record,
            organization_mode=organization_mode,
            element_mode=element_mode,
            fields_profile_id=fields_profile_id,
            field_configs=field_configs,
            repo_root=repo_root,
        )
    except (ValueError, RuntimeError, OSError) as exc:
        logger.warning(
            "Persistance précompile échouée (%s / %s): %s",
            category_stem,
            record.get("Nom"),
            exc,
        )
