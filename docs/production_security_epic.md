# Epic production — sécurité et durcissement (optionnel)

Backlog structurant pour un déploiement hors **defaults dev** documentés dans `AGENTS.md`. Ne pas modifier `DISABLE_AUTH` ni les raccourcis locaux sans décision produit explicite.

## Périmètre suggéré

- **JWT** : rotation refresh, claims `aud` / `iss` pour multi-services, réduction surface avec stockage token (évaluation httpOnly cookies vs localStorage).
- **CSP** : politique de contenu stricte sur le frontend servi en prod ; tests de régression sur inline scripts éventuels.
- **Observabilité** : endpoint `/metrics` (ou équivalent) protégé en prod ; corrélation `request_id`.
- **Mots de passe / auth** : journalisation des erreurs inattendues dans `verify_password` sans fuite d’information ; rate limiting login.
- **Headers** : HSTS, `X-Content-Type-Options`, etc., au niveau reverse proxy.

## Références code

- `api/middleware/cost_governance.py` — en-têtes `X-Estimated-*` pour aligner le budget pré-requête sur l’estimation client.
- `SecurityConfig.validate_config()` — garde-fous prod vs dev.

Chaque item doit passer par une revue dédiée et des tests (contract + E2E minimal) avant activation en production.
