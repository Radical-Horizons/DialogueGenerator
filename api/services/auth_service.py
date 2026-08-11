"""Service d'authentification pour l'API."""
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Optional
from uuid import uuid4

import bcrypt
from jose import JWTError, jwt

from api.config.security_config import get_security_config
from api.utils.password_policy import PasswordPolicyError, validate_password
from services.repositories.sqlite.user_repository import (
    DuplicateUsernameError,
    IUserRepository,
    UserRecord,
)

if TYPE_CHECKING:
    from services.audit_log_service import AuditLogService

logger = logging.getLogger(__name__)

# Configuration JWT
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 7
GUEST_ACCESS_TOKEN_EXPIRE_HOURS = 8
GUEST_SUBJECT = "guest"
GUEST_ROLE = "guest"
_DUMMY_PASSWORD_HASH = bcrypt.hashpw(b"timing-only-password", bcrypt.gensalt())


class AuthService:
    """Service pour gérer l'authentification et les tokens JWT."""
    
    def __init__(
        self,
        user_repository: IUserRepository | None = None,
        audit_log_service: "AuditLogService | None" = None,
    ) -> None:
        """Initialise le service d'authentification."""
        security_config = get_security_config()
        self.secret_key = security_config.jwt_secret_key
        self.algorithm = ALGORITHM
        self.access_token_expire = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        self.refresh_token_expire = timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        self._user_repository = user_repository
        self._audit_log_service = audit_log_service

    def create_user(
        self,
        username: str,
        email: str,
        password: str,
        role: str = "writer",
        actor: dict[str, object] | None = None,
    ) -> UserRecord:
        """Crée un compte dans le repository SQLite injecté.

        Args:
            username: Nom d'utilisateur unique.
            email: Adresse email du collaborateur.
            password: Mot de passe en clair à hasher.
            role: Rôle persisté, limité à ``admin`` ou ``writer``.
            actor: Administrateur à l'origine de la création, le cas échéant.

        Returns:
            Enregistrement utilisateur persisté.

        Raises:
            RuntimeError: Si aucun repository n'a été injecté.
            ValueError: Si le rôle demandé n'est pas supporté.
        """
        if self._user_repository is None:
            raise RuntimeError("UserRepository requis pour créer un compte.")
        if role not in {"admin", "writer"}:
            raise ValueError(f"Rôle utilisateur non supporté: {role}")
        validate_password(password)

        user_data = {
            "id": str(uuid4()),
            "username": username,
            "email": email,
            "hashed_password": self.hash_password(password),
            "role": role,
        }
        user = self._user_repository.insert(user_data)
        logger.info(
            "Compte utilisateur créé",
            extra={
                "actor_id": actor.get("id") if actor else None,
                "actor_username": actor.get("username") if actor else None,
                "target_user_id": user["id"],
                "action": "user.created",
                "new_role": role,
            },
        )
        if self._audit_log_service is not None:
            self._audit_log_service.log_action(
                action="user.created",
                target_type="user",
                target_id=user["id"],
                actor=actor,
                metadata={"new_role": role, "username": user["username"]},
            )
        return user

    def list_users(self) -> list[UserRecord]:
        """Retourne tous les comptes pour l'administration."""
        if self._user_repository is None:
            raise RuntimeError("UserRepository requis pour lister les comptes.")
        return self._user_repository.list_all()

    def update_user(
        self,
        user_id: str,
        *,
        role: str | None,
        is_active: bool | None,
        actor: dict[str, object],
    ) -> UserRecord | None:
        """Modifie rôle/état avec invariant transactionnel anti-lockout.

        Args:
            user_id: Identifiant du compte cible.
            role: Nouveau rôle éventuel.
            is_active: Nouvel état éventuel.
            actor: Administrateur à l'origine de la mutation.

        Returns:
            Compte mis à jour, ou ``None`` si la cible est absente.

        Raises:
            RuntimeError: Si le repository n'est pas injecté.
            LastActiveAdminError: Si le dernier admin actif serait retiré.
        """
        if self._user_repository is None:
            raise RuntimeError("UserRepository requis pour modifier un compte.")
        update_result = self._user_repository.update_role_and_status(
            user_id,
            role=role,
            is_active=is_active,
        )
        if update_result is None:
            return None
        updated, changed = update_result
        if changed:
            logger.info(
                "Mutation administrative utilisateur",
                extra={
                    "actor_id": actor.get("id"),
                    "actor_username": actor.get("username"),
                    "target_user_id": user_id,
                    "action": "user.role_status.updated",
                    "new_role": updated["role"],
                    "new_is_active": updated["is_active"],
                },
            )
            if self._audit_log_service is not None:
                self._audit_log_service.log_action(
                    action="user.role_status.updated",
                    target_type="user",
                    target_id=user_id,
                    actor=actor,
                    metadata={
                        "new_role": updated["role"],
                        "new_is_active": updated["is_active"],
                    },
                )
        return updated

    def change_password(
        self,
        user_id: str,
        *,
        current_password: str,
        new_password: str,
        actor: dict[str, object] | None = None,
    ) -> UserRecord:
        """Change le mot de passe d'un compte SQLite après vérification de l'actuel.

        Args:
            user_id: Identifiant du compte (jamais un principal guest).
            current_password: Mot de passe actuel en clair.
            new_password: Nouveau mot de passe en clair (validé en amont).
            actor: Principal à l'origine du changement (audit).

        Returns:
            Enregistrement utilisateur après mise à jour.

        Raises:
            RuntimeError: Si le repository n'est pas injecté.
            LookupError: Si le compte est introuvable.
            PermissionError: Si le mot de passe actuel est incorrect.
        """
        if self._user_repository is None:
            raise RuntimeError("UserRepository requis pour changer un mot de passe.")
        user = self._user_repository.find_by_id(user_id)
        if user is None or not user["is_active"]:
            raise LookupError("Compte utilisateur introuvable ou inactif.")
        if not self.verify_password(current_password, user["hashed_password"]):
            raise PermissionError("Mot de passe actuel incorrect.")
        hashed = self.hash_password(new_password)
        updated = self._user_repository.update_password(user_id, hashed)
        if updated is None:
            raise LookupError("Compte utilisateur introuvable.")
        logger.info(
            "Mot de passe utilisateur modifié",
            extra={
                "actor_id": actor.get("id") if actor else None,
                "actor_username": actor.get("username") if actor else None,
                "target_user_id": user_id,
                "action": "user.password.changed",
            },
        )
        if self._audit_log_service is not None:
            self._audit_log_service.log_action(
                action="user.password.changed",
                target_type="user",
                target_id=user_id,
                actor=actor,
                metadata={"username": updated["username"]},
            )
        return updated

    def seed_admin_if_needed(self, admin_password: str | None) -> None:
        """Sème le compte administrateur si la base n'en contient aucun.

        Args:
            admin_password: Mot de passe provenant de ``ADMIN_PASSWORD``.

        Returns:
            ``None``. La méthode est idempotente et ignore un compte existant.

        Raises:
            PasswordPolicyError: Si ``ADMIN_PASSWORD`` est défini mais invalide.
        """
        if self._user_repository is None:
            logger.debug("Seed admin ignoré: UserRepository non initialisé.")
            return
        if admin_password is None:
            logger.warning(
                "ADMIN_PASSWORD non défini — compte admin non seedé. "
                "Définir ADMIN_PASSWORD avant redémarrage (environnement=%s).",
                os.getenv("ENVIRONMENT", "development"),
            )
            return

        try:
            validate_password(admin_password)
        except PasswordPolicyError as exc:
            logger.error("ADMIN_PASSWORD invalide: %s", exc)
            raise

        existing = self._user_repository.find_by_username("admin")
        if existing is not None:
            self._validate_existing_admin(existing)
            return

        try:
            self._user_repository.insert(
                {
                    "id": str(uuid4()),
                    "username": "admin",
                    "email": "admin@example.com",
                    "hashed_password": self.hash_password(admin_password),
                    "role": "admin",
                }
            )
        except DuplicateUsernameError:
            raced_admin = self._user_repository.find_by_username("admin")
            if raced_admin is None:
                raise RuntimeError(
                    "Le seed admin a rencontré un conflit username sans enregistrement admin."
                )
            self._validate_existing_admin(raced_admin)
            logger.info("Seed admin déjà effectué par un autre démarrage concurrent.")
            return
        logger.info("Compte admin seedé depuis ADMIN_PASSWORD")

    @staticmethod
    def _validate_existing_admin(user: UserRecord) -> None:
        """Vérifie qu'un compte ``admin`` existant peut satisfaire le seed."""
        if user["role"] != "admin":
            logger.error(
                "Seed admin impossible: le username admin existe avec un rôle non administrateur."
            )
            raise RuntimeError(
                "Le username admin existe déjà avec un rôle non administrateur."
            )
        logger.debug("Seed admin ignoré: le compte admin existe déjà.")
    
    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Vérifie un mot de passe.
        
        Args:
            plain_password: Mot de passe en clair.
            hashed_password: Mot de passe hashé.
            
        Returns:
            True si le mot de passe correspond, False sinon.
        """
        try:
            return bcrypt.checkpw(
                plain_password.encode("utf-8"),
                hashed_password.encode("utf-8"),
            )
        except (TypeError, UnicodeError, ValueError):
            return False

    @staticmethod
    def _verify_dummy_password(plain_password: str) -> None:
        """Égalise le coût bcrypt quand le compte recherché est absent."""
        try:
            bcrypt.checkpw(
                plain_password.encode("utf-8"),
                _DUMMY_PASSWORD_HASH,
            )
        except (TypeError, UnicodeError, ValueError):
            return
    
    def hash_password(self, password: str) -> str:
        """Hash un mot de passe.
        
        Args:
            password: Mot de passe en clair.
            
        Returns:
            Mot de passe hashé.
        """
        validate_password(password)
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
        return hashed.decode('utf-8')
    
    def authenticate_user(self, username: str, password: str) -> dict[str, object] | None:
        """Authentifie un compte SQLite actif.
        
        Args:
            username: Nom d'utilisateur.
            password: Mot de passe.
            
        Returns:
            Informations publiques de l'utilisateur si authentifié, sinon ``None``.
        """
        if self._user_repository is None:
            logger.error("Authentification impossible: UserRepository non injecté.")
            return None

        user = self._user_repository.find_by_username(username)
        if user is None or not user["is_active"]:
            self._verify_dummy_password(password)
            logger.debug(
                "Échec d'authentification pour username=%s: compte absent ou inactif.",
                username,
            )
            return None

        if not self.verify_password(password, user["hashed_password"]):
            logger.debug("Échec d'authentification pour username=%s: mot de passe invalide.", username)
            return None

        return {
            "id": user["id"],
            "username": user["username"],
            "email": user["email"],
            "role": user["role"],
            "is_active": user["is_active"],
        }
    
    def create_access_token(self, data: dict, expires_delta: Optional[timedelta] = None) -> str:
        """Crée un token d'accès JWT.
        
        Args:
            data: Données à encoder dans le token.
            expires_delta: Durée de validité du token (optionnel).
            
        Returns:
            Token JWT encodé.
        """
        to_encode = data.copy()
        if expires_delta:
            expire = datetime.now(timezone.utc) + expires_delta
        else:
            expire = datetime.now(timezone.utc) + self.access_token_expire
        
        to_encode.update({"exp": expire, "type": "access"})
        encoded_jwt = jwt.encode(to_encode, self.secret_key, algorithm=self.algorithm)
        return encoded_jwt

    def create_guest_access_token(self) -> str:
        """Émet un JWT invité (hors table users) pour la démo lecture seule.

        Chaque émission porte un ``sid`` unique (UUID) pour isoler les jobs
        en mémoire entre sessions guest (anti-IDOR Epic 8).

        Returns:
            Access token JWT avec ``role=guest`` et TTL de 8 heures.
        """
        session_id = str(uuid4())
        return self.create_access_token(
            data={
                "sub": GUEST_SUBJECT,
                "role": GUEST_ROLE,
                "sid": session_id,
            },
            expires_delta=timedelta(hours=GUEST_ACCESS_TOKEN_EXPIRE_HOURS),
        )

    @staticmethod
    def guest_principal(session_id: Optional[str] = None) -> dict[str, object]:
        """Retourne l'identité synthétique invité (aucune ligne SQLite).

        Args:
            session_id: Identifiant de session JWT (``sid``), si présent.

        Returns:
            Dictionnaire compatible avec les dépendances d'auth.
        """
        principal: dict[str, object] = {
            "id": GUEST_SUBJECT,
            "username": GUEST_SUBJECT,
            "email": None,
            "role": GUEST_ROLE,
            "is_active": True,
        }
        if isinstance(session_id, str) and session_id.strip():
            principal["session_id"] = session_id.strip()
        return principal

    @staticmethod
    def guest_principal_from_payload(payload: dict) -> dict[str, object]:
        """Construit le principal guest depuis un payload JWT vérifié.

        Args:
            payload: Claims du token access (``sub``, ``role``, ``sid``).

        Returns:
            Principal guest, avec ``session_id`` si ``sid`` est présent.
        """
        sid = payload.get("sid")
        session_id = str(sid).strip() if isinstance(sid, str) and sid.strip() else None
        return AuthService.guest_principal(session_id=session_id)


    @property
    def guest_token_expire_seconds(self) -> int:
        """Durée de validité du token invité en secondes."""
        return int(timedelta(hours=GUEST_ACCESS_TOKEN_EXPIRE_HOURS).total_seconds())

    def create_refresh_token(self, data: dict) -> str:
        """Crée un token de rafraîchissement JWT.
        
        Args:
            data: Données à encoder dans le token.
            
        Returns:
            Token JWT encodé.
        """
        to_encode = data.copy()
        expire = datetime.now(timezone.utc) + self.refresh_token_expire
        to_encode.update({"exp": expire, "type": "refresh"})
        encoded_jwt = jwt.encode(to_encode, self.secret_key, algorithm=self.algorithm)
        return encoded_jwt
    
    def verify_token(self, token: str, token_type: str = "access") -> Optional[dict]:
        """Vérifie et décode un token JWT.
        
        Args:
            token: Token JWT à vérifier.
            token_type: Type de token attendu ("access" ou "refresh").
            
        Returns:
            Données décodées du token si valide, None sinon.
        """
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
            
            # Vérifier le type de token
            if payload.get("type") != token_type or "exp" not in payload:
                return None
            
            return payload
        except JWTError:
            return None
    
    def get_user_by_username(self, username: str) -> dict[str, object] | None:
        """Récupère un compte SQLite actif par son nom d'utilisateur.
        
        Args:
            username: Nom d'utilisateur.
            
        Returns:
            Informations publiques de l'utilisateur actif, ou ``None``.
        """
        if self._user_repository is None:
            logger.error("Résolution utilisateur impossible: UserRepository non injecté.")
            return None

        user = self._user_repository.find_by_username(username)
        if user is None or not user["is_active"]:
            logger.debug(
                "Utilisateur non résolu pour username=%s: compte absent ou inactif.",
                username,
            )
            return None

        return {
            "id": user["id"],
            "username": user["username"],
            "email": user["email"],
            "role": user["role"],
            "is_active": user["is_active"],
        }

