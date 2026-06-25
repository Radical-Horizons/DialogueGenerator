"""Tests formatage erreurs schéma Unity (messages utilisateur)."""
from __future__ import annotations

from services.unity_schema_error_formatter import (
    format_test_pattern_error,
    is_test_field_path,
)


class TestUnitySchemaErrorFormatter:
    """Messages actionnables pour champs test."""

    def test_is_test_field_path(self) -> None:
        """Chemins nœud et choix reconnus."""
        assert is_test_field_path("nodes.0.test") is True
        assert is_test_field_path("nodes.0.choices.1.test") is True
        assert is_test_field_path("nodes.0.choices") is False

    def test_format_test_pattern_error_detects_space_in_skill(self) -> None:
        """Régression : pas de regex brute ; l'espace est expliqué."""
        msg = format_test_pattern_error("Raison+Déplacement silencieux:9")
        assert "Attribut+Compétence:DD" in msg
        assert "Raison+Rhétorique:8" in msg
        assert "Déplacement silencieux" in msg
        assert "espace" in msg
        assert "^" not in msg

    def test_format_test_pattern_error_missing_plus(self) -> None:
        """Valeur sans séparateur +."""
        msg = format_test_pattern_error("RaisonRhétorique:8")
        assert "manque le « + »" in msg
