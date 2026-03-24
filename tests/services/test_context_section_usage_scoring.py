"""Tests scoring usage par section GDD (Story 3.7)."""
import json

from services.context_section_usage_scoring import (
    REFLECTED_THRESHOLD_PERCENT,
    compute_context_section_usage_result,
)


def test_section_usage_single_type_block() -> None:
    system = (
        "### Personnages\n"
        "UniqueTokenAlpha vit au port narratif long.\n\n"
        "--- Input ---\n"
    )
    prompt = system + "[]"
    response = json.dumps(
        {
            "line": "UniqueTokenAlpha vit au port narratif dans la scène.",
            "choices": [],
        },
        ensure_ascii=False,
    )
    r = compute_context_section_usage_result(
        prompt, response, request_id="req-s1"
    )
    assert r["request_id"] == "req-s1"
    assert r["method"] == "section_keyword_overlap_v2"
    assert len(r["entity_groups"]) >= 1
    g0 = r["entity_groups"][0]
    assert g0["entity_type"] == "characters"
    assert len(g0["sections"]) >= 1
    assert g0["sections"][0]["status"] == "reflected"
    assert g0["sections"][0]["overlap_percent"] >= REFLECTED_THRESHOLD_PERCENT
    assert r["reflected_section_count"] >= 1


def test_section_usage_weak_when_no_overlap() -> None:
    prompt = "### Lieux\nLieuSansMatchQQQ description.\n\n--- Input ---\n[]"
    response = json.dumps({"line": "rien en commun", "choices": []})
    r = compute_context_section_usage_result(prompt, response, request_id="req-w")
    assert r["weak_section_count"] >= 1
    assert all(s["status"] == "weak" for s in r["weak_sections"])


def test_section_usage_entity_and_subsections() -> None:
    system = (
        "### Personnages\n"
        "## HérosTest\n"
        "### Introduction\n"
        "MotIntroZZZ unique.\n"
        "### Qualités\n"
        "MotQualBBB.\n"
    )
    prompt = system + "\n\n--- Input ---\n[]"
    response = json.dumps(
        {"line": "MotIntroZZZ et MotQualBBB dans la scène.", "choices": []},
        ensure_ascii=False,
    )
    r = compute_context_section_usage_result(prompt, response)
    labels = {g["entity_label"] for g in r["entity_groups"]}
    assert "HérosTest" in labels
    hero = next(g for g in r["entity_groups"] if g["entity_label"] == "HérosTest")
    titles = {s["section_title"] for s in hero["sections"]}
    assert "Introduction" in titles
    assert "Qualités" in titles


def test_section_usage_empty_prompt_no_crash() -> None:
    r = compute_context_section_usage_result("", "")
    assert r["entity_groups"] == []
    assert r["weak_section_count"] == 0
    assert r["reflected_section_count"] == 0


def test_parser_note_when_xml_system_prompt() -> None:
    system = '<?xml version="1.0"?><root><context>TokenXMLNote</context></root>'
    prompt = system + "\n\n--- Input ---\n[]"
    r = compute_context_section_usage_result(prompt, "{}")
    note = r.get("parser_note")
    assert note is not None
    assert "xml" in note.lower()
