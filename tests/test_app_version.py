"""Tests pour la version applicative synchronisée (api/app_version)."""
import re

from api.app_version import APP_VERSION

_SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+$")


def test_app_version_semver_format() -> None:
    """APP_VERSION respecte le format semver X.Y.Z (aligné sur package.json racine)."""
    assert _SEMVER_RE.match(APP_VERSION), f"APP_VERSION invalide: {APP_VERSION!r}"
