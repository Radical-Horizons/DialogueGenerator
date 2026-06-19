from pathlib import Path

root = Path("data/.gdd_context_precompile")
sizes = []
for p in root.rglob("*.json"):
    if p.name == "manifest.json":
        continue
    sizes.append((p.stat().st_size, p))
for sz, p in sorted(sizes, reverse=True)[:10]:
    print(f"{sz // 1024} KB\t{p.parent.name}\t{p.stem}")
