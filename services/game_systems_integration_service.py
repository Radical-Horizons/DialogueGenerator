"""Catalogue d'intégration des systèmes de jeu utilisables par les dialogues."""

from __future__ import annotations

from api.schemas.game_systems import (
    GameSystemFamily,
    GameSystemsIntegrationCatalogResponse,
    RuntimeSourceStatus,
)


class GameSystemsIntegrationService:
    """Construit le catalogue FR94 sans dépendre d'une connexion runtime."""

    def get_catalog(self) -> GameSystemsIntegrationCatalogResponse:
        """Retourne les familles FR94 et un état runtime non bloquant par défaut."""
        return GameSystemsIntegrationCatalogResponse(
            families=[
                GameSystemFamily(
                    id="attributes_skills",
                    label="Caractéristiques & Compétences",
                    description="Tests tentables : caractéristique + compétence + modificateurs vs DD.",
                ),
                GameSystemFamily(
                    id="effort",
                    label="Gestion de l'Effort",
                    description="Pool preview par défaut 10 PE, coûts d'Effort et choix grisés si insuffisant.",
                ),
                GameSystemFamily(
                    id="reputation",
                    label="Réputation",
                    description="Admiration, Prestige et Crainte avec cible sociale et paliers calculés.",
                ),
            ],
            runtime_source=RuntimeSourceStatus(
                status="disconnected",
                label="Source runtime externe (Unity/API/fichier config)",
                editing_blocked=False,
                message=(
                    "Source runtime externe non connectée : édition locale disponible via preview simulée."
                ),
            ),
        )
