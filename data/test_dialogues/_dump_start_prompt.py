"""Dump START scene_instructions and GDD name resolution."""
from pathlib import Path

from core.context.context_builder import ContextBuilder
from services.dialogue_dramatic_progression import compose_generation_instructions

composed = compose_generation_instructions(
    "Écris un dialogue RPG court et cohérent.",
    depth=0,
    max_depth=4,
    is_start=True,
)
lines = ["=== scene_instructions (START, expand-tree) ===", composed, "---"]
cb = ContextBuilder()
cb.load_gdd_files()
for name in ["Uresair", "Uresaïr", "Voknir Esh'Maradel"]:
    try:
        data = cb.get_character_details_by_name(name)
    except Exception as exc:
        data = None
        lines.append(f"Resolve {name!r}: ERROR {exc}")
        continue
    status = "OK" if data else "MISSING"
    nom = data.get("Nom", "") if data else ""
    lines.append(f"Resolve {name!r}: {status} {nom}")
Path("data/test_dialogues/_composed_start.txt").write_text("\n".join(lines), encoding="utf-8")
print("written")
