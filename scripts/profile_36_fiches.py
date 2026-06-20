"""cProfile sur build_context_json ~36 fiches, field_configs UI."""
from __future__ import annotations

import cProfile
import io
import pstats

from api.container import ServiceContainer
from constants import Defaults


def main() -> None:
    container = ServiceContainer()
    cb = container.get_context_builder()
    cfg = cb.context_config or {}
    all_fields: dict[str, list[str]] = {}
    for etype in ("character", "location", "item", "species", "community"):
        paths: list[str] = []
        type_cfg = cfg.get(etype, {})
        if isinstance(type_cfg, dict):
            for _prio, fields in type_cfg.items():
                if isinstance(fields, list):
                    for fc in fields:
                        if isinstance(fc, dict) and fc.get("path"):
                            paths.append(str(fc["path"]))
        all_fields[etype] = list(dict.fromkeys(paths))

    per = 9
    sd = {
        "characters_full": cb.get_characters_names()[:per],
        "locations_full": cb.get_locations_names()[:per],
        "species_full": cb.get_species_names()[:per],
        "communities_full": cb.get_communities_names()[:per],
    }

    def run() -> None:
        cb.build_context_json(
            selected_elements=sd,
            scene_instruction=" ",
            field_configs=all_fields,
            organization_mode="narrative",
            max_tokens=Defaults.MAX_CONTEXT_TOKENS,
        )

    pr = cProfile.Profile()
    pr.enable()
    run()
    pr.disable()
    buf = io.StringIO()
    pstats.Stats(pr, stream=buf).sort_stats("cumtime").print_stats(15)
    print(buf.getvalue())


if __name__ == "__main__":
    main()
