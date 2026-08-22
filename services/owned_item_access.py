"""Accès aux objets possédés : propriété + statut de visibilité.

Un seul modèle pour tous les objets réutilisables de l'app — templates, profils
d'auteur. Ce qui décide qui voit quoi tient à deux champs portés par l'objet
lui-même : `ownerId` et `visibility` (`shared` | `private`). Il n'y a pas de table
d'ACL, donc rien à tenir cohérent avec les fichiers sur disque.

Généralisé plutôt que dupliqué : deux implémentations de `can_read`/`can_write`
finissent toujours par diverger, et ce dépôt en a déjà fait deux fois les frais.
"""

from __future__ import annotations

from typing import List, Mapping, Optional, Protocol, TypeVar, runtime_checkable

from api.utils.job_ownership import template_owner_key


@runtime_checkable
class OwnedVisibleItem(Protocol):
    """Objet possédé portant un statut de visibilité."""

    id: str
    ownerId: Optional[str]
    visibility: str

    def model_copy(self, *, update: dict[str, object]) -> "OwnedVisibleItem":
        """Copie Pydantic avec surcharge de champs."""
        ...


ItemT = TypeVar("ItemT", bound=OwnedVisibleItem)


class ItemAccessNotFoundError(LookupError):
    """Objet absent, ou hors de la visibilité de l'acteur (404 métier)."""


class ItemAccessForbiddenError(Exception):
    """Mutation refusée (403)."""


class ItemAccessValidationError(ValueError):
    """Identifiant invalide (slug pré-built, id non UUID)."""


class OwnedItemAccessService:
    """Décide qui voit et qui modifie un objet possédé, sans table d'ACL."""

    def __init__(self, *, user_repository: object | None = None) -> None:
        """Initialise le service.

        Args:
            user_repository: Conservé pour résoudre un nom d'affichage de propriétaire.
        """
        self._users = user_repository

    @staticmethod
    def _actor_id(current_user: Mapping[str, object]) -> str:
        """Identifiant propriétaire (UUID writer, ``guest:{sid}`` pour un invité)."""
        return template_owner_key(current_user)

    @staticmethod
    def _is_admin(current_user: Mapping[str, object]) -> bool:
        """Admin actif."""
        return (
            current_user.get("role") == "admin"
            and current_user.get("is_active") is True
        )

    @staticmethod
    def _owner_id(item: OwnedVisibleItem) -> Optional[str]:
        """Owner persisté, ou None si legacy."""
        raw = (getattr(item, "ownerId", None) or "").strip()
        return raw or None

    @staticmethod
    def _visibility(item: OwnedVisibleItem) -> str:
        """Statut déclaré ; `shared` par défaut pour un fichier antérieur au champ."""
        return getattr(item, "visibility", "shared") or "shared"

    def relation(
        self, item: OwnedVisibleItem, current_user: Mapping[str, object]
    ) -> Optional[str]:
        """``owned`` / ``team`` / ``legacy`` — la relation de l'acteur, ou None si invisible.

        Args:
            item: Objet évalué.
            current_user: Principal auth.

        Returns:
            La relation, ou None quand l'objet n'a pas à apparaître.
        """
        owner = self._owner_id(item)
        if owner is None:
            return "legacy"
        if owner == self._actor_id(current_user):
            return "owned"
        return "team" if self._visibility(item) == "shared" else None

    def can_read(self, item: OwnedVisibleItem, current_user: Mapping[str, object]) -> bool:
        """Lecture : visible en liste, ou admin."""
        if self._is_admin(current_user):
            return True
        return self.relation(item, current_user) is not None

    def can_write(self, item: OwnedVisibleItem, current_user: Mapping[str, object]) -> bool:
        """Qui peut le voir peut le modifier.

        Le statut porte déjà toute la frontière : un objet ``private`` n'est lisible que
        par son auteur, donc lui seul l'écrit ; un objet ``shared`` appartient à l'équipe
        qui le voit, donc elle l'édite. Superposer une règle de propriété à un statut de
        visibilité ajoutait une seconde frontière là où une seule a du sens — et rendait
        intouchables les objets dont le propriétaire n'existe plus.
        """
        return self.can_read(item, current_user)

    def can_delete(self, item: OwnedVisibleItem, current_user: Mapping[str, object]) -> bool:
        """Suppression : mêmes droits que l'écriture."""
        return self.can_write(item, current_user)

    def can_change_visibility(
        self, item: OwnedVisibleItem, current_user: Mapping[str, object]
    ) -> bool:
        """Statut privé/partagé : mêmes droits que l'écriture."""
        return self.can_write(item, current_user)

    def annotate(self, item: ItemT, current_user: Mapping[str, object]) -> ItemT:
        """Ajoute la relation calculée (non persistée)."""
        return item.model_copy(update={"relation": self.relation(item, current_user)})

    def list_visible(
        self, items: List[ItemT], current_user: Mapping[str, object]
    ) -> List[ItemT]:
        """Filtre une liste selon la propriété et le statut."""
        visible: List[ItemT] = []
        for item in items:
            if self.relation(item, current_user) is None:
                continue
            visible.append(self.annotate(item, current_user))
        return visible

    def require_readable(self, item: ItemT, current_user: Mapping[str, object]) -> ItemT:
        """404 métier si hors visibilité."""
        if not self.can_read(item, current_user):
            raise ItemAccessNotFoundError(f"Objet {item.id} introuvable")
        return self.annotate(item, current_user)

    def require_writable(self, item: ItemT, current_user: Mapping[str, object]) -> ItemT:
        """403 si mutation interdite."""
        self.require_readable(item, current_user)
        if not self.can_write(item, current_user):
            raise ItemAccessForbiddenError(f"Modification refusée pour {item.id}")
        return item

    def require_deletable(self, item: ItemT, current_user: Mapping[str, object]) -> ItemT:
        """403 si suppression interdite."""
        self.require_readable(item, current_user)
        if not self.can_delete(item, current_user):
            raise ItemAccessForbiddenError(f"Suppression refusée pour {item.id}")
        return item
