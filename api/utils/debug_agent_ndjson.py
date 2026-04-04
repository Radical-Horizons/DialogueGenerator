"""Append-only NDJSON lines for agent debug sessions (repo root ``debug-*.log``)."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Mapping

_REPO_ROOT = Path(__file__).resolve().parents[2]


def write_agent_debug_log(
    *,
    log_filename: str,
    hypothesis_id: str,
    location: str,
    message: str,
    data: Mapping[str, Any],
    session_id: str = "d08897",
    run_id: str = "pre-fix",
) -> None:
    """Append one NDJSON object; swallow I/O errors (never break requests).

    Args:
        log_filename: Basename only (e.g. ``debug-d08897.log``), written under repo root.
        hypothesis_id: Agent hypothesis tag.
        location: Logical source reference.
        message: Short description.
        data: Serializable payload (no secrets).
        session_id: Debug session id.
        run_id: Run label (e.g. pre-fix / post-fix).
    """
    path = _REPO_ROOT / log_filename
    line = json.dumps(
        {
            "sessionId": session_id,
            "runId": run_id,
            "hypothesisId": hypothesis_id,
            "location": location,
            "message": message,
            "data": dict(data),
            "timestamp": int(time.time() * 1000),
        },
        ensure_ascii=False,
    )
    try:
        with path.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass
