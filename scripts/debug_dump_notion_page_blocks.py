"""Diagnostic : compare arbre de blocs API vs attente « corps dans les callouts».

Requiert ``NOTION_API_KEY``. Page par défaut : fiche « Rêveurs primordiaux » (Espèces).
Voir : ``docs/notion_public_api_block_gap.md``.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys

import httpx

PAGE = "22e6e4d2-1b45-80db-8065-d98d26821c2c"


async def main() -> None:
    key = os.getenv("NOTION_API_KEY", "").strip()
    if not key:
        print("NO_KEY", file=sys.stderr)
        sys.exit(2)
    h = {
        "Authorization": f"Bearer {key}",
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
    }
    base = "https://api.notion.com/v1"
    async with httpx.AsyncClient(timeout=60.0) as c:
        pr = await c.get(f"{base}/pages/{PAGE}", headers=h)
        pr.raise_for_status()
        props = pr.json().get("properties") or {}
        print("--- page properties (all types, size hints) ---")
        for pk, pv in sorted(props.items()):
            if not isinstance(pv, dict):
                continue
            ptype = pv.get("type")
            hint = ""
            if ptype == "rich_text":
                rt = pv.get("rich_text") or []
                hint = str(
                    sum(
                        len(x.get("plain_text", "") or "")
                        for x in rt
                        if isinstance(x, dict)
                    )
                )
            elif ptype == "title":
                rt = pv.get("title") or []
                hint = str(
                    sum(
                        len(x.get("plain_text", "") or "")
                        for x in rt
                        if isinstance(x, dict)
                    )
                )
            else:
                raw = json.dumps(pv, ensure_ascii=False)[:200]
                hint = f"json_head={raw!r}"
            print(pk, ptype, hint)
        r = await c.get(f"{base}/blocks/{PAGE}/children", headers=h)
        r.raise_for_status()
        blocks = r.json().get("results") or []
        print("top_level_count", len(blocks))
        for i, b in enumerate(blocks):
            bt = b.get("type")
            bid = (b.get("id") or "")[:8]
            hc = b.get("has_children")
            print(i, bt, bid, "has_children", hc)
            if bt == "paragraph":
                pdata = b.get("paragraph") or {}
                rt = pdata.get("rich_text") or []
                plen = sum(len(x.get("plain_text", "") or "") for x in rt if isinstance(x, dict))
                print("   -> paragraph plain_len", plen, "runs", len(rt))
            if bt == "callout":
                cid = b.get("id")
                r2 = await c.get(f"{base}/blocks/{cid}/children", headers=h)
                r2.raise_for_status()
                ch = r2.json().get("results") or []
                print("   -> children", len(ch), [x.get("type") for x in ch[:15]])
                cdata = b.get("callout") or {}
                rt = cdata.get("rich_text") or []
                clen = sum(len(x.get("plain_text", "") or "") for x in rt if isinstance(x, dict))
                print("   -> callout rich_text plain_len", clen, "preview", rt[:1])


if __name__ == "__main__":
    asyncio.run(main())
