"""Persistance des profils d'auteur : fichiers JSON UUID sous ``data/author_profiles/``.

Calqué sur `TemplateService` — même stockage fichier, même validation de chemin (un id
non-UUID ne peut pas désigner un fichier, ce qui ferme la traversée de répertoire).
Les voix fournies avec le projet restent un catalogue en lecture seule.
"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from api.schemas.author_profile import (
    AuthorProfile,
    AuthorProfileMetadata,
    PrebuiltAuthorProfile,
)

logger = logging.getLogger(__name__)

DIALOGUE_GENERATOR_DIR = Path(__file__).resolve().parent.parent
DEFAULT_PROFILES_DIR = DIALOGUE_GENERATOR_DIR / "data" / "author_profiles"
DEFAULT_PREBUILT_FILE = DIALOGUE_GENERATOR_DIR / "config" / "author_profile_templates.json"


class AuthorProfileService:
    """CRUD des profils d'auteur persistés."""

    def __init__(
        self,
        profiles_dir: Optional[Path] = None,
        prebuilt_path: Optional[Path] = None,
    ) -> None:
        """Initialise le service.

        Args:
            profiles_dir: Dossier de stockage (défaut : ``data/author_profiles/``).
            prebuilt_path: Catalogue des voix fournies.
        """
        self.profiles_dir = profiles_dir or DEFAULT_PROFILES_DIR
        self.profiles_dir.mkdir(parents=True, exist_ok=True)
        self.prebuilt_path = prebuilt_path or DEFAULT_PREBUILT_FILE
        logger.info("AuthorProfileService initialisé sur %s", self.profiles_dir)

    def _profile_path(self, profile_id: str) -> Path:
        """Résout le chemin JSON d'un UUID (refuse un id non-UUID)."""
        try:
            UUID(profile_id)
        except ValueError as exc:
            raise FileNotFoundError(f"Profil {profile_id} introuvable") from exc
        return self.profiles_dir / f"{profile_id}.json"

    def _save(self, profile: AuthorProfile) -> None:
        """Écrit le profil sur disque, sans les champs calculés."""
        payload = profile.model_dump(mode="json", exclude={"relation"})
        path = self._profile_path(profile.id)
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def create_profile(self, data: Dict[str, Any]) -> AuthorProfile:
        """Crée et persiste un profil.

        Args:
            data: name, description, content, visibility, owner_id.

        Returns:
            Le profil persisté.
        """
        now = datetime.now(timezone.utc)
        raw_owner = data.get("ownerId") or data.get("owner_id")
        profile = AuthorProfile(
            id=str(uuid4()),
            name=data["name"],
            description=data.get("description", "") or "",
            content=data.get("content", "") or "",
            metadata=AuthorProfileMetadata(created=now, modified=now),
            ownerId=(str(raw_owner).strip() or None) if raw_owner else None,
            visibility=data.get("visibility") or "shared",
        )
        self._save(profile)
        logger.info("Profil d'auteur créé: %s (%s)", profile.name, profile.id)
        return profile

    def list_profiles(self) -> List[AuthorProfile]:
        """Liste tous les profils lisibles sur disque (les illisibles sont ignorés)."""
        profiles: List[AuthorProfile] = []
        if not self.profiles_dir.exists():
            return profiles
        for path in sorted(self.profiles_dir.glob("*.json")):
            try:
                profiles.append(AuthorProfile(**json.loads(path.read_text(encoding="utf-8"))))
            except (json.JSONDecodeError, ValueError, TypeError, OSError) as exc:
                logger.error("Profil d'auteur illisible %s: %s", path.name, exc)
                continue
        return profiles

    def get_profile(self, profile_id: str) -> AuthorProfile:
        """Charge un profil par UUID.

        Raises:
            FileNotFoundError: Fichier absent ou UUID invalide.
        """
        path = self._profile_path(profile_id)
        if not path.exists():
            raise FileNotFoundError(f"Profil {profile_id} introuvable")
        return AuthorProfile(**json.loads(path.read_text(encoding="utf-8")))

    def update_profile(self, profile_id: str, data: Dict[str, Any]) -> AuthorProfile:
        """Met à jour un profil existant (champs partiels).

        Raises:
            FileNotFoundError: Profil absent.
        """
        profile = self.get_profile(profile_id)
        updates: Dict[str, Any] = {}
        for field in ("name", "description", "content"):
            if data.get(field) is not None:
                updates[field] = data[field]
        if data.get("visibility") in ("shared", "private"):
            updates["visibility"] = data["visibility"]
        updates["metadata"] = profile.metadata.model_copy(
            update={"modified": datetime.now(timezone.utc)}
        )
        updated = profile.model_copy(update=updates)
        self._save(updated)
        logger.info("Profil d'auteur mis à jour: %s", profile_id)
        return updated

    def delete_profile(self, profile_id: str) -> None:
        """Supprime le fichier du profil.

        Raises:
            FileNotFoundError: Profil absent.
        """
        path = self._profile_path(profile_id)
        if not path.exists():
            raise FileNotFoundError(f"Profil {profile_id} introuvable")
        path.unlink()
        logger.info("Profil d'auteur supprimé: %s", profile_id)

    def list_prebuilt(self) -> List[PrebuiltAuthorProfile]:
        """Voix fournies avec le projet, en lecture seule."""
        try:
            payload = json.loads(self.prebuilt_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            logger.error("Catalogue de voix illisible (%s): %s", self.prebuilt_path, exc)
            return []
        entries = payload.get("templates", payload) if isinstance(payload, dict) else payload
        prebuilt: List[PrebuiltAuthorProfile] = []
        for entry in entries or []:
            if not isinstance(entry, dict):
                continue
            prebuilt.append(
                PrebuiltAuthorProfile(
                    id=str(entry.get("id") or ""),
                    name=str(entry.get("name") or ""),
                    description=str(entry.get("description") or ""),
                    # Le catalogue historique nomme ce champ `profile`.
                    content=str(entry.get("profile") or entry.get("content") or ""),
                )
            )
        return prebuilt
