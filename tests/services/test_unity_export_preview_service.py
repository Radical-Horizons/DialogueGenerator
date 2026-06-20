"""Tests service preview export Unity (Story 5.5)."""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from services.unity_export_preview_service import (
    PREVIEW_TRUNCATE_BYTES,
    preview_batch_documents,
    preview_graph_export,
    preview_persisted_document,
)


_VALID_NODE_ID = "node-a1b2c3d4e5f6789012345678abcdef01"

_VALID_GRAPH_NODES = [
    {
        "id": _VALID_NODE_ID,
        "type": "dialogueNode",
        "position": {"x": 0, "y": 0},
        "data": {
            "stableId": _VALID_NODE_ID,
            "displayName": "Ouverture",
            "line": "Bonjour",
            "speaker": "PNJ",
            "choices": [{"choiceId": "choice_reply", "text": "Répondre"}],
        },
    },
    {"id": "END", "type": "endNode", "position": {"x": 0, "y": 200}, "data": {"line": ""}},
]
_VALID_GRAPH_EDGES = [
    {
        "id": "e1",
        "source": _VALID_NODE_ID,
        "target": "END",
        "data": {"edgeType": "choice", "choiceIndex": 0},
    }
]


@pytest.mark.unit
def test_preview_graph_export_returns_size_and_nodes():
    result = preview_graph_export(
        _VALID_GRAPH_NODES,
        _VALID_GRAPH_EDGES,
        title="Service Preview",
    )
    assert result.schema_valid is True
    assert result.node_count >= 1
    assert result.size_bytes == len(result.json_content.encode("utf-8"))
    assert "nodes" in json.loads(result.json_content)


@pytest.mark.unit
def test_preview_persisted_document_reads_file(tmp_path: Path):
    doc = {"schemaVersion": "1.2.0", "nodes": [{"id": "START", "line": "Hi", "choices": []}]}
    (tmp_path / "demo.json").write_text(json.dumps(doc), encoding="utf-8")
    mock_config = MagicMock()
    mock_config.get_unity_dialogues_path.return_value = str(tmp_path)

    result = preview_persisted_document(mock_config, "demo")
    assert result.filename == "demo.json"
    assert result.node_count == 1


@pytest.mark.unit
def test_batch_preview_truncates_large_json(tmp_path: Path):
    huge_line = "x" * (PREVIEW_TRUNCATE_BYTES + 500)
    doc = {"schemaVersion": "1.2.0", "nodes": [{"id": "START", "line": huge_line, "choices": []}]}
    (tmp_path / "big.json").write_text(json.dumps(doc), encoding="utf-8")
    mock_config = MagicMock()
    mock_config.get_unity_dialogues_path.return_value = str(tmp_path)

    result = preview_batch_documents(mock_config, ["big"])
    assert result.dialogue_count == 1
    assert result.items[0].json_preview_truncated is True
