"""Politique commune de validation des mots de passe."""

from __future__ import annotations


MIN_PASSWORD_LENGTH = 8
MAX_BCRYPT_PASSWORD_BYTES = 72


class PasswordPolicyError(ValueError):
    """Signale qu'un mot de passe ne respecte pas la politique applicative."""


def validate_password(password: str) -> None:
    """Valide un mot de passe sans journaliser ni exposer sa valeur.

    Args:
        password: Mot de passe en clair à valider.

    Raises:
        PasswordPolicyError: Si le mot de passe est vide, trop court, contient
            un octet NUL ou est trop long pour bcrypt après encodage UTF-8.
    """
    if not password or not password.strip():
        raise PasswordPolicyError("Le mot de passe ne peut pas être vide.")
    if len(password) < MIN_PASSWORD_LENGTH:
        raise PasswordPolicyError(
            f"Le mot de passe doit contenir au moins {MIN_PASSWORD_LENGTH} caractères."
        )
    try:
        password_bytes = password.encode("utf-8")
    except UnicodeEncodeError as exc:
        raise PasswordPolicyError(
            "Le mot de passe contient une séquence Unicode non valide."
        ) from exc
    if b"\x00" in password_bytes:
        raise PasswordPolicyError(
            "Le mot de passe ne peut pas contenir de caractère NUL."
        )
    if len(password_bytes) > MAX_BCRYPT_PASSWORD_BYTES:
        raise PasswordPolicyError(
            "Le mot de passe dépasse la limite de 72 octets UTF-8 de bcrypt."
        )
