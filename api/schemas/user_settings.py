"""Schémas API des préférences utilisateur synchronisées."""

import json
from typing import Any

from pydantic import RootModel, field_validator


class UserSettingsMap(RootModel[dict[str, Any]]):
    """Map JSON de clés de préférences appartenant à un namespace."""

    @field_validator("root")
    @classmethod
    def validate_json_values(cls, value: dict[str, Any]) -> dict[str, Any]:
        """Vérifie que toutes les valeurs sont sérialisables en JSON."""
        try:
            json.dumps(value, ensure_ascii=False)
        except (TypeError, ValueError) as exc:
            raise ValueError("Les préférences doivent être sérialisables en JSON.") from exc
        return value


class AllUserSettingsMap(RootModel[dict[str, dict[str, Any]]]):
    """Map imbriquée namespace puis clé des préférences utilisateur."""
