# Epic 7 Context: Collaboration et contrôle d'accès

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Permettre à une équipe narrative authentifiée de collaborer sur des dialogues avec des droits explicites, tout en donnant aux invités un accès en lecture seule sans compte. L’epic remplace les identités volatiles par une fondation SQLite locale, conserve les dialogues comme fichiers JSON, centralise leur propriété et leurs partages, et rend les actions sensibles traçables pour soutenir 3 à 5 utilisateurs concurrents au MVP.

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

- L’inscription publique est fermée. Seul un administrateur crée des comptes; le rôle par défaut est `writer`, et les seuls rôles persistés sont `admin` et `writer`. La lecture invitée ne doit pas créer de compte ni de rôle `viewer`.
- Le premier démarrage peut créer le compte `admin` seulement à partir de `ADMIN_PASSWORD`; aucun mot de passe ne doit être codé en dur. Les mots de passe sont hashés avec bcrypt, les JWT d’accès expirent après 15 minutes et le refresh repose sur un cookie `httpOnly` de 7 jours.
- Un writer peut modifier ses propres dialogues et ceux partagés en co-édition. Les partages entre comptes n’acceptent que la permission `writer`; seul le propriétaire ou un administrateur peut les accorder ou les révoquer.
- Un invité lit un dialogue uniquement avec un lien dédié valide, non expiré et non révoqué. L’API doit refuser toute mutation et toute génération, indépendamment des protections de l’interface; l’export Unity reste autorisé.
- Les mutations importantes — comptes, rôles, dialogues, partages et révocations — produisent des entrées d’audit append-only. Consultation, filtrage et export des audits sont réservés aux administrateurs.
- Les accès doivent respecter propriétaire, partage et rôle avec une application systématique côté API. Le système vise 3 à 5 utilisateurs concurrents au MVP, puis 10+; les conflits d’édition doivent être détectés et signalés proprement.
- Une migration SQLite défaillante doit empêcher les routes métier dépendantes de servir et apparaître explicitement dans les logs et l’état de santé.
- Le mode local `DISABLE_AUTH=true` et le bypass frontend restent inchangés. Les tests d’authentification réelle utilisent `DISABLE_AUTH=false`; tous les tests SQLite utilisent une base temporaire, jamais `data/app.db`.

## Technical Decisions

- La base relationnelle locale est `data/app.db`, créée au démarrage et ignorée par Git avec ses fichiers WAL/SHM. Les migrations SQL sont numérotées, atomiques, idempotentes et suivies dans `schema_migrations`; le mode WAL soutient les lectures concurrentes.
- SQLite stocke `users`, `user_settings`, `app_settings`, `dialogues_index`, `dialogue_shares`, `share_links` et `audit_logs`. Les graphes restent des JSON sur disque; l’index conserve notamment propriétaire, dernier éditeur, dates et chemin de stockage.
- L’accès SQLite passe par des repositories sous `services/repositories/sqlite/`. Connexion et repositories sont injectés via `ServiceContainer`; aucun singleton global. `AuthService` délègue à `UserRepository` et remplace le stockage utilisateur en mémoire sans casser les flux login, refresh et logout existants.
- Les contrôles RBAC sont des dépendances backend sur les routes concernées, puis reflétés dans le frontend. L’index dialogue est mis à jour seulement après la réussite de la persistance du document.
- Les préférences des namespaces `context` et `generation` ont l’API comme source de vérité. Au premier login, la migration depuis `localStorage` est best-effort et ne remplace jamais des valeurs déjà présentes côté serveur.
- Les paramètres applicatifs globaux ne contiennent que des valeurs non secrètes. Les actions d’audit sont émises par les services métier afin de journaliser uniquement les mutations réussies.

## UX & Interaction Patterns

- L’interface masque ou désactive les actions selon les permissions, mais conserve des retours explicites et accessibles en cas de refus. Gestion des utilisateurs et audits sont réservés aux administrateurs.
- La route invitée affiche clairement « Mode invité — lecture seule » et rend l’édition, le déplacement, la sauvegarde et la génération indisponibles. Un lien expiré ou révoqué produit un message actionnable.
- Le panneau de permissions présente propriétaire, co-éditeurs et liens invités actifs. Les révocations et promotions administrateur utilisent une confirmation explicite; les formulaires gardent validation en temps réel, focus visible et navigation clavier.
- La liste des dialogues expose un statut compréhensible — privé, co-édité ou lien invité actif — sans révéler d’information inaccessible.

## Cross-Story Dependencies

- 7.0 débloque toutes les autres stories; 7.1 fournit les comptes à 7.2 et 7.3. 7.4 pose `dialogues_index`, requis par les partages et consommé par le listing/recherche de l’Epic 8.
- 7.5 et 7.6 alimentent la vue agrégée de 7.7; 7.8 journalise les mutations introduites par 7.3 à 7.7. 7.9 dépend du login persistant de 7.2.
- L’Epic 0 fournit JWT, rate limiting et configuration de sécurité. L’Epic 10 peut exploiter `last_modified_by` et les audits; la co-édition temps réel reste hors périmètre.
