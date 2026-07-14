# Epic 7 Context: Collaboration et contrôle d'accès

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Permettre à une équipe narrative authentifiée de travailler sur des dialogues persistants avec un contrôle d'accès explicite, tout en offrant aux invités une consultation sans compte et sans risque de modification. L'epic remplace la gestion utilisateur volatile par une fondation SQLite locale, protège les dialogues par propriétaire et partage, et rend l'activité traçable pour soutenir la collaboration de 3 à 5 utilisateurs au MVP.

## Stories

- Story 7.0: Fondation SQLite application
- Story 7.1: Créer comptes utilisateurs — admin only
- Story 7.2: Se connecter et se déconnecter du système
- Story 7.3: Administrateurs gèrent les utilisateurs
- Story 7.4: Writers créent, éditent et suppriment dialogues
- Story 7.5: Invités en lecture seule sans compte
- Story 7.6: Partager dialogues en co-édition entre writers
- Story 7.7: Voir qui a accès à chaque dialogue
- Story 7.8: Audit logs actions utilisateurs
- Story 7.9: Préférences utilisateur synchronisées serveur

## Requirements & Constraints

- L'inscription publique est fermée : seuls les administrateurs créent des comptes, avec `writer` comme rôle par défaut. Les rôles persistés sont uniquement `admin` et `writer`; ne pas créer de rôle utilisateur `viewer`.
- L'authentification doit utiliser des mots de passe hashés (bcrypt ou équivalent), des JWT expirants et un refresh cookie `httpOnly`, `Secure` et `SameSite` en production. Les appels de production passent par HTTPS.
- Un writer ne peut modifier que ses dialogues ou ceux qui lui sont explicitement partagés pour co-édition. Un invité peut uniquement lire via un lien dédié; toute mutation ou génération doit être refusée côté API, pas seulement masquée dans l'interface.
- Les liens invités doivent être révocables et expirables. Les partages entre comptes autorisent uniquement la permission `writer`.
- Toute mutation importante (comptes, dialogues, partages, révocations, rôles) doit produire un audit append-only; la consultation et l'export des audits sont réservés aux administrateurs.
- Le service doit supporter 3–5 utilisateurs concurrents au MVP et évoluer vers 10+; les accès non-LLM courants doivent rester réactifs. Les erreurs de migration doivent provoquer un démarrage dégradé explicite et empêcher les routes métier dépendantes de servir.
- Le comportement de développement local avec `DISABLE_AUTH=true` et le bypass frontend doit rester inchangé; l'authentification réelle doit être testable avec `DISABLE_AUTH=false`.
- Les tests utilisent une base SQLite temporaire isolée, jamais `data/app.db` de développement.

## Technical Decisions

- SQLite local dans `data/app.db`, créé au démarrage; migrations SQL numérotées suivies par `schema_migrations`. Le mode WAL est recommandé pour les lectures concurrentes.
- Les tables relationnelles couvrent migrations, utilisateurs, préférences, configuration applicative non secrète, index de dialogues, partages, liens invités et audits. Le contenu des graphes JSON reste sur disque; `dialogues_index` conserve propriétaire, dates, chemin et dernier éditeur.
- Les connexions et repositories vivent sous `services/repositories/sqlite/`, avec une instance partagée par processus injectée via `api/container.py`/`ServiceContainer`. Aucun singleton global de repository.
- `AuthService` délègue l'authentification et la création de comptes à `UserRepository`; le stockage utilisateur en mémoire doit disparaître sans modifier le contrat public des flux login existants.
- Les permissions doivent être appliquées dans les dépendances/routeurs API et reflétées par les contrôles frontend. L'index est mis à jour après une sauvegarde de document réussie, sans déplacer le blob JSON.
- Les préférences `context` et `generation` deviennent la source serveur. La migration depuis `localStorage` est best-effort au premier login et ne doit pas écraser une valeur déjà présente côté serveur.

## UX & Interaction Patterns

- L'interface adapte navigation, actions et panneaux aux permissions : gestion utilisateurs et audits visibles uniquement aux admins; édition, partage et génération indisponibles en lecture seule.
- Le parcours invité utilise une route dédiée, affiche clairement « Mode invité — lecture seule », conserve l'export Unity, et fournit un message explicite pour un lien expiré ou révoqué.
- Le panneau de permissions expose propriétaire, co-éditeurs et liens invités actifs; les actions de révocation demandent une confirmation et restent limitées au propriétaire ou à l'admin.
- Les préférences synchronisées sont hydratées après connexion; le stockage local peut servir de cache, mais l'absence de fallback offline n'est pas bloquante pour cette version.

## Cross-Story Dependencies

- La fondation 7.0 précède le seed admin (7.1), la migration de login (7.2), les utilisateurs/settings et toutes les données de partage.
- 7.1 précède 7.2 et 7.3; 7.4 fournit `dialogues_index`, consommé ensuite par le listing/recherche de l'Epic 8.
- 7.5 et 7.6 alimentent la visibilité agrégée de 7.7; 7.8 journalise les mutations introduites par 7.3–7.7.
- L'Epic 0 fournit JWT, rate limiting et `SecurityConfig`. L'Epic 10 pourra exploiter `last_modified_by` et les audits; l'Epic 6 peut ajouter ultérieurement des métadonnées de propriétaire aux presets.
