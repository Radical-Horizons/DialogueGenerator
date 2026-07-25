---
description: Système de logs complet — archivage, rotation, consultation API, intégration frontend, debug, erreur
alwaysApply: false
---
- **Architecture**: Logging structuré avec archivage persistant (fichiers JSON par date), rotation automatique, API de consultation, intégration frontend.
- **Handler fichier**: `DateRotatingFileHandler` (`api/utils/log_file_handler.py`) — écriture dans `data/logs/logs_YYYY-MM-DD.json`, rotation quotidienne + intra-jour si > 100MB, gestion erreurs avec fallback console.
- **Configuration**: Variables d'environnement `LOG_FILE_ENABLED`, `LOG_RETENTION_DAYS` (30 par défaut), `LOG_DIR`, `LOG_MAX_FILE_SIZE_MB`, `LOG_FORMAT` (json/text), `LOG_LEVEL`, `LOG_CONSOLE_LEVEL`, `LOG_FILE_LEVEL`.
- **Niveaux de log séparés**: `LOG_CONSOLE_LEVEL` (console, défaut: WARNING en dev) et `LOG_FILE_LEVEL` (fichiers, défaut: INFO). `LOG_LEVEL` reste supporté pour compatibilité (appliqué aux deux si les autres ne sont pas définis).
- **Commandes de développement**: `npm run dev` (par défaut, console WARNING), `npm run dev:debug` (console DEBUG), `npm run dev:verbose` (console INFO), `npm run dev:quiet` (console WARNING). Pour ERROR uniquement: `npm run dev --log-level=ERROR`. Flags: `--debug/-d`, `--verbose/-v`, `--quiet/-q`, `--log-level=LEVEL`.
- **Service de logs**: `LogService` (`api/services/log_service.py`) — recherche par critères (date, niveau, logger, request_id, endpoint), statistiques, nettoyage automatique.
- **API de consultation**: Router `/api/v1/logs` — `GET /api/v1/logs` (recherche avec pagination), `GET /api/v1/logs/stats` (statistiques), `GET /api/v1/logs/files` (liste fichiers), `POST /api/v1/logs/frontend` (réception logs frontend).
- **Frontend**: Service `logging.ts` — logger structuré, envoi automatique des logs critiques au backend, gestion erreurs globales (window.error, unhandledrejection), initialisé dans `App.tsx`.
- **Nettoyage**: `log_cleanup.py` — suppression automatique fichiers > 30 jours au démarrage API, script standalone pour nettoyage manuel.
- **Format JSON**: Chaque log contient timestamp, level, logger, message, module/function/line, request_id, endpoint, method, status_code, duration_ms, environment, exception si présente.
- **Tests**: `tests/utils/test_log_file_handler.py` (handler), `tests/api/test_logs.py` (API), mocks pour éviter écriture réelle en tests.
- **Références**: Voir `README_API.md` section "Système de logs" pour détails complets et exemples d'utilisation.
