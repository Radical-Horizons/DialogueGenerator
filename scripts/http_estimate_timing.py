"""HTTP timing estimate-tokens (comme DevTools)."""
import json
import time
import urllib.request

from api.container import ServiceContainer

cb = ServiceContainer().get_context_builder()
small = {
    "characters": cb.get_characters_names()[:2],
    "locations": cb.get_locations_names()[:1],
    "species": cb.get_species_names()[:1],
}
body = {
    "context_selections": {
        "characters_full": small["characters"],
        "characters_excerpt": [],
        "locations_full": small["locations"],
        "locations_excerpt": [],
        "items_full": [],
        "items_excerpt": [],
        "species_full": small["species"],
        "species_excerpt": [],
        "communities_full": [],
        "communities_excerpt": [],
        "dialogues_examples": [],
    },
    "user_instructions": " ",
    "organization_mode": "narrative",
    "max_context_tokens": 200000,
}
data = json.dumps(body).encode("utf-8")
url = "http://localhost:4243/api/v1/context/estimate-tokens"
for label, n in [("4 fiches", body), ("36 fiches", None)]:
    if n is None:
        per = 9
        b = dict(body)
        b["context_selections"] = dict(b["context_selections"])
        b["context_selections"]["characters_full"] = cb.get_characters_names()[:per]
        b["context_selections"]["locations_full"] = cb.get_locations_names()[:per]
        b["context_selections"]["species_full"] = cb.get_species_names()[:per]
        b["context_selections"]["communities_full"] = cb.get_communities_names()[:per]
        data = json.dumps(b).encode("utf-8")
    else:
        data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    t0 = time.perf_counter()
    with urllib.request.urlopen(req, timeout=120) as resp:
        raw = resp.read()
    ms = (time.perf_counter() - t0) * 1000
    print(f"{label}: {ms:.0f} ms, {len(raw)/1024:.0f} KB")
