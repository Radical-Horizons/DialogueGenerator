"""Tests utilitaire job_owner_key (anti-IDOR guest)."""

from api.utils.job_ownership import job_owner_key


def test_writer_uses_username() -> None:
    """Un writer est identifié par son username."""
    assert job_owner_key({"username": "alice", "id": "1", "role": "writer"}) == "alice"


def test_guest_with_session_id_is_isolated() -> None:
    """Deux guests avec sid distincts ont des clés distinctes."""
    a = job_owner_key(
        {"username": "guest", "id": "guest", "role": "guest", "session_id": "sid-a"}
    )
    b = job_owner_key(
        {"username": "guest", "id": "guest", "role": "guest", "session_id": "sid-b"}
    )
    assert a == "guest:sid-a"
    assert b == "guest:sid-b"
    assert a != b


def test_guest_without_session_falls_back() -> None:
    """Legacy guest sans sid → clé partagée (tokens pré-fix)."""
    assert (
        job_owner_key({"username": "guest", "id": "guest", "role": "guest"}) == "guest"
    )
