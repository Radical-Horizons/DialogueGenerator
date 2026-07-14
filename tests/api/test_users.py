"""Tests comportementaux de la création administrative de comptes."""

import logging
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
from typing import Iterator

import bcrypt
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from api.config.security_config import get_security_config
from api.dependencies import require_admin
from api.main import app
from api.routers.auth import get_current_user_or_none
from api.services.auth_service import AuthService
from api.utils.password_policy import PasswordPolicyError
from services.repositories.sqlite.connection import DatabaseConnection
from services.repositories.sqlite.state import get_database_status
from services.repositories.sqlite.user_repository import (
    DuplicateUsernameError,
    UserRecord,
    UserRepository,
)


def _admin_user() -> dict[str, object]:
    """Retourne un utilisateur admin de test."""
    return {
        "id": "admin-id",
        "username": "admin",
        "role": "admin",
        "is_active": True,
    }


def _writer_user() -> dict[str, object]:
    """Retourne un utilisateur writer de test."""
    return {
        "id": "writer-id",
        "username": "writer",
        "role": "writer",
        "is_active": True,
    }


def _unauthenticated_user() -> None:
    """Retourne l'absence d'authentification pour les tests."""
    return None


@pytest.fixture
def admin_client(client: TestClient) -> Iterator[TestClient]:
    """Fournit un client dont la requête est authentifiée comme admin."""
    app.dependency_overrides[get_current_user_or_none] = _admin_user
    yield client
    app.dependency_overrides.pop(get_current_user_or_none, None)


@pytest.fixture
def writer_client(client: TestClient) -> Iterator[TestClient]:
    """Fournit un client dont la requête est authentifiée comme writer."""
    app.dependency_overrides[get_current_user_or_none] = _writer_user
    yield client
    app.dependency_overrides.pop(get_current_user_or_none, None)


@pytest.fixture
def unauthenticated_client(client: TestClient) -> Iterator[TestClient]:
    """Fournit un client sans utilisateur authentifié."""
    app.dependency_overrides[get_current_user_or_none] = _unauthenticated_user
    yield client
    app.dependency_overrides.pop(get_current_user_or_none, None)


def _user_payload(username: str = "writer-one") -> dict[str, str]:
    """Construit un payload valide de création de compte."""
    return {
        "username": username,
        "email": f"{username}@example.com",
        "password": "strong-pass-123",
    }


def _insert_concurrently(
    repository: UserRepository,
    barrier: Barrier,
    username: str,
) -> UserRecord | DuplicateUsernameError:
    """Synchronise deux insertions concurrentes avant leur transaction."""
    barrier.wait(timeout=5)
    try:
        return repository.insert(
            {
                "username": username,
                "email": f"{username}@example.com",
                "hashed_password": "not-used",
                "role": "writer",
            }
        )
    except DuplicateUsernameError as exc:
        return exc


def test_create_user_as_admin_succeeds(
    admin_client: TestClient,
    isolated_app_database: DatabaseConnection,
) -> None:
    """Un admin crée un writer et ne reçoit jamais son hash."""
    response = admin_client.post("/api/v1/users", json=_user_payload())

    assert response.status_code == 201
    body = response.json()
    assert body["role"] == "writer"
    assert "hashed_password" not in body
    assert "access_token" not in body

    stored = app.state.container.get_user_repository().find_by_username("writer-one")
    assert stored is not None
    assert bcrypt.checkpw(
        b"strong-pass-123",
        stored["hashed_password"].encode("utf-8"),
    )


def test_create_user_with_legacy_admin_token_succeeds(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Le token admin historique reste accepté avant la migration 7.2."""
    monkeypatch.setattr(get_security_config(), "disable_auth", False)
    login_response = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin123"},
    )
    assert login_response.status_code == 200

    token = login_response.json()["access_token"]
    response = client.post(
        "/api/v1/users",
        json=_user_payload("legacy-admin-created"),
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 201


def test_create_user_as_writer_returns_403(writer_client: TestClient) -> None:
    """Un writer ne peut pas créer de compte."""
    response = writer_client.post("/api/v1/users", json=_user_payload())

    assert response.status_code == 403


def test_create_user_unauthenticated_returns_403(
    unauthenticated_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Une requête sans authentification est refusée."""
    monkeypatch.setattr(get_security_config(), "disable_auth", False)
    response = unauthenticated_client.post("/api/v1/users", json=_user_payload())

    assert response.status_code == 403


def test_create_user_disable_auth_bypasses(client: TestClient) -> None:
    """Le bypass local DISABLE_AUTH conserve l'accès admin de développement."""
    assert get_security_config().disable_auth is True

    response = client.post("/api/v1/users", json=_user_payload("local-admin-bypass"))

    assert response.status_code == 201


def test_create_user_duplicate_username_returns_409(
    admin_client: TestClient,
) -> None:
    """Un username déjà présent produit une erreur de conflit."""
    payload = _user_payload("duplicate-user")

    first_response = admin_client.post("/api/v1/users", json=payload)
    second_response = admin_client.post("/api/v1/users", json=payload)

    assert first_response.status_code == 201
    assert second_response.status_code == 409
    assert second_response.json()["error"]["message"] == "Username déjà utilisé"


def test_create_user_case_variants_share_canonical_username(
    admin_client: TestClient,
) -> None:
    """Des variantes de casse ne peuvent pas créer deux comptes logiques."""
    first_response = admin_client.post(
        "/api/v1/users",
        json=_user_payload("Alice"),
    )
    second_response = admin_client.post(
        "/api/v1/users",
        json=_user_payload("alice"),
    )

    assert first_response.status_code == 201
    assert first_response.json()["username"] == "alice"
    assert second_response.status_code == 409


def test_user_repository_serializes_concurrent_case_variant_inserts(
    isolated_app_database: DatabaseConnection,
) -> None:
    """Deux connexions SQLite concurrentes produisent un seul doublon logique."""
    second_database = DatabaseConnection(isolated_app_database.database_path)
    first_repository = UserRepository(isolated_app_database)
    second_repository = UserRepository(second_database)
    barrier = Barrier(2)

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [
                executor.submit(
                    _insert_concurrently,
                    first_repository,
                    barrier,
                    "ConcurrentUser",
                ),
                executor.submit(
                    _insert_concurrently,
                    second_repository,
                    barrier,
                    "concurrentuser",
                ),
            ]
            results = [future.result() for future in futures]
    finally:
        second_database.close()

    duplicate_results = [
        result for result in results if isinstance(result, DuplicateUsernameError)
    ]
    assert len(duplicate_results) == 1
    assert first_repository.find_by_username("CONCURRENTUSER") is not None


def test_create_user_invalid_password_short_returns_422(
    admin_client: TestClient,
) -> None:
    """Un mot de passe trop court est signalé par champ."""
    payload = _user_payload()
    payload["password"] = "short"

    response = admin_client.post("/api/v1/users", json=payload)

    assert response.status_code == 422
    assert "password" in response.json()["error"]["details"]


@pytest.mark.parametrize("password", ["        ", "é" * 40, "valid\x00pass"])
def test_create_user_invalid_password_policy_returns_422(
    admin_client: TestClient,
    password: str,
) -> None:
    """Les mots de passe invalides pour bcrypt sont refusés par champ."""
    payload = _user_payload()
    payload["password"] = password

    response = admin_client.post("/api/v1/users", json=payload)

    assert response.status_code == 422
    assert "password" in response.json()["error"]["details"]


def test_create_user_missing_password_returns_422(admin_client: TestClient) -> None:
    """Un mot de passe absent produit une erreur de validation par champ."""
    payload = _user_payload()
    payload.pop("password")

    response = admin_client.post("/api/v1/users", json=payload)

    assert response.status_code == 422
    assert "password" in response.json()["error"]["details"]


@pytest.mark.parametrize("username", ["Admin", "   ", "writer\none"])
def test_create_user_invalid_or_reserved_username_returns_422(
    admin_client: TestClient,
    username: str,
) -> None:
    """Les usernames ambigus ou réservés sont refusés par champ."""
    response = admin_client.post(
        "/api/v1/users",
        json=_user_payload(username),
    )

    assert response.status_code == 422
    assert "username" in response.json()["error"]["details"]


def test_create_user_invalid_email_returns_422(admin_client: TestClient) -> None:
    """Une adresse email invalide est signalée par champ."""
    payload = _user_payload()
    payload["email"] = "not-an-email"

    response = admin_client.post("/api/v1/users", json=payload)

    assert response.status_code == 422
    assert "email" in response.json()["error"]["details"]


def test_seed_admin_on_first_boot(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Le lifespan sème un admin hashé dans une base vide."""
    database_path = tmp_path / "boot-seed" / "app.db"
    monkeypatch.setenv("APP_DATABASE", str(database_path))
    monkeypatch.setenv("ADMIN_PASSWORD", "test12345")

    with TestClient(app):
        pass

    with sqlite3.connect(database_path) as connection:
        row = connection.execute(
            "SELECT role, hashed_password FROM users WHERE username = 'admin'"
        ).fetchone()

    assert row is not None
    assert row[0] == "admin"
    assert bcrypt.checkpw(
        b"test12345",
        str(row[1]).encode("utf-8"),
    )


def test_seed_admin_idempotent(isolated_app_database: DatabaseConnection) -> None:
    """Un second seed conserve le même compte sans doublon."""
    service = app.state.container.get_auth_service()

    service.seed_admin_if_needed("test12345")
    first_admin = app.state.container.get_user_repository().find_by_username("admin")
    service.seed_admin_if_needed("different-password")
    second_admin = app.state.container.get_user_repository().find_by_username("admin")

    assert first_admin is not None
    assert second_admin is not None
    assert second_admin["id"] == first_admin["id"]


def test_seed_admin_handles_concurrent_duplicate_as_idempotent(
    isolated_app_database: DatabaseConnection,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Un conflit d'insertion gagné par un autre seed reste idempotent."""
    service = app.state.container.get_auth_service()
    repository = app.state.container.get_user_repository()
    original_insert = repository.insert
    first_insert = True

    def insert_then_report_duplicate(
        user_data: dict[str, object],
    ) -> dict[str, object]:
        """Simule l'insertion concurrente du premier administrateur."""
        nonlocal first_insert
        if first_insert:
            first_insert = False
            original_insert(user_data)
            raise DuplicateUsernameError("admin")
        return original_insert(user_data)

    monkeypatch.setattr(repository, "insert", insert_then_report_duplicate)

    service.seed_admin_if_needed("test12345")

    admin = repository.find_by_username("admin")
    assert admin is not None
    assert admin["role"] == "admin"


def test_seed_admin_rejects_existing_non_admin_username(
    isolated_app_database: DatabaseConnection,
) -> None:
    """Un username admin préexistant avec un rôle writer bloque le seed."""
    repository = app.state.container.get_user_repository()
    repository.insert(
        {
            "username": "admin",
            "email": "writer@example.com",
            "hashed_password": "not-used",
            "role": "writer",
        }
    )

    with pytest.raises(RuntimeError, match="rôle non administrateur"):
        app.state.container.get_auth_service().seed_admin_if_needed("test12345")


def test_user_repository_rejects_unsupported_role(
    isolated_app_database: DatabaseConnection,
) -> None:
    """Le repository n'accepte que les rôles persistables connus."""
    with pytest.raises(ValueError, match="Rôle utilisateur non supporté"):
        app.state.container.get_user_repository().insert(
            {
                "username": "invalid-role",
                "email": "invalid@example.com",
                "hashed_password": "not-used",
                "role": "owner",
            }
        )


@pytest.mark.parametrize(
    "admin_password",
    ["       ", "short", "é" * 40, "valid\x00pass"],
)
def test_seed_admin_invalid_password_fails_configuration(
    isolated_app_database: DatabaseConnection,
    admin_password: str,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Un ADMIN_PASSWORD défini mais invalide bloque le seed sans secret loggé."""
    with caplog.at_level(logging.ERROR):
        with pytest.raises(PasswordPolicyError):
            app.state.container.get_auth_service().seed_admin_if_needed(admin_password)

    assert app.state.container.get_user_repository().find_by_username("admin") is None
    assert "ADMIN_PASSWORD invalide" in caplog.text
    assert admin_password not in caplog.text


def test_seed_admin_no_env_var_in_production(
    isolated_app_database: DatabaseConnection,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Sans mot de passe, le seed journalise un avertissement et n'écrit rien."""
    monkeypatch.setenv("ENVIRONMENT", "production")
    service = app.state.container.get_auth_service()

    with caplog.at_level(logging.WARNING):
        service.seed_admin_if_needed(None)

    assert app.state.container.get_user_repository().find_by_username("admin") is None
    assert "ADMIN_PASSWORD non défini" in caplog.text


def test_seed_admin_invalid_password_blocks_lifespan(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Un ADMIN_PASSWORD invalide empêche le lifespan de démarrer sainement."""
    invalid_password = "é" * 40
    monkeypatch.setenv("APP_DATABASE", str(tmp_path / "invalid-admin" / "app.db"))
    monkeypatch.setenv("ADMIN_PASSWORD", invalid_password)

    with caplog.at_level(logging.ERROR):
        with pytest.raises(PasswordPolicyError):
            with TestClient(app):
                pass

    database_status = get_database_status()
    assert database_status.ready is False
    assert "ADMIN_PASSWORD invalide" in caplog.text
    assert invalid_password not in caplog.text


def test_seed_admin_unexpected_startup_error_is_critical(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Un échec inattendu du seed bloque le boot et invalide SQLite."""
    monkeypatch.setenv("APP_DATABASE", str(tmp_path / "startup-failure" / "app.db"))

    def fail_seed(self: AuthService, admin_password: str | None) -> None:
        """Simule une erreur inattendue pendant le seed."""
        raise RuntimeError("simulated seed failure")

    monkeypatch.setattr(AuthService, "seed_admin_if_needed", fail_seed)

    with caplog.at_level(logging.CRITICAL):
        with pytest.raises(RuntimeError, match="simulated seed failure"):
            with TestClient(app):
                pass

    assert "Échec critique du seed du compte administrateur" in caplog.text
    assert get_database_status().ready is False


@pytest.mark.parametrize(
    ("current_user", "accepted"),
    [
        ({"username": "admin", "is_active": True}, False),
        ({"username": "writer", "role": "admin", "is_active": True}, True),
        ({"username": "admin", "role": "admin", "is_active": False}, False),
    ],
)
def test_require_admin_uses_explicit_role_and_active_status(
    current_user: dict[str, object],
    accepted: bool,
) -> None:
    """L'autorisation ne dépend ni du username seul ni d'un compte inactif."""
    if accepted:
        assert require_admin(current_user) == current_user
        return

    with pytest.raises(HTTPException) as exc_info:
        require_admin(current_user)

    assert exc_info.value.status_code == 403
