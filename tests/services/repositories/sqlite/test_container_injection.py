"""Tests d'injection du repository SQLite par ServiceContainer."""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from api.container import ServiceContainer


def test_container_shares_database_and_user_repository_instances(
    tmp_path: Path,
    monkeypatch,
) -> None:
    """Le container partage les instances même au premier accès concurrent."""
    monkeypatch.setenv("APP_DATABASE", str(tmp_path / "app.db"))
    container = ServiceContainer()

    def resolve_instances(_: int) -> tuple[object, object]:
        """Résout les dépendances depuis un worker concurrent."""
        return (
            container.get_database_connection(),
            container.get_user_repository(),
        )

    with ThreadPoolExecutor(max_workers=4) as executor:
        instances = list(executor.map(resolve_instances, range(4)))

    assert len({id(database) for database, _ in instances}) == 1
    assert len({id(repository) for _, repository in instances}) == 1
    assert all(repository.ping() for _, repository in instances)
    container.close()
