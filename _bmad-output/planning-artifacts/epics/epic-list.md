# Epic List

**Séquençage (SM, mise à jour 2026-03) :** **Epic 17** (mobile / responsive web) est priorisé **tôt** : après **Epics 0–3**, et **avant** d’approfondir massivement **Epics 4–6** (validation, export Unity, templates) sur une UI encore desktop-only. L’identifiant 17 évite de renuméroter les epics déjà suivis dans `sprint-status.yaml`.

## Epic 0: Infrastructure & Setup (Brownfield Adjustments)

Les utilisateurs peuvent travailler sur une application stable avec l'infrastructure technique nécessaire. Le système configure ADR-001 à ADR-004 (Progress Modal SSE, Presets, Graph Fixes, Multi-Provider LLM), ID-001 à ID-005 (Auto-save, Validation cycles, Cost governance, Streaming cleanup, Preset validation).

## Epic 1: Génération de dialogues assistée par IA

Les utilisateurs peuvent générer des nœuds de dialogue de qualité professionnelle avec assistance LLM, gérer les coûts et itérer rapidement. Le système permet la génération single/batch, l'édition manuelle, l'auto-link, et fournit transparence complète sur les coûts et prompts utilisés.

## Epic 2: Éditeur de graphe de dialogues

Les utilisateurs peuvent visualiser, naviguer et éditer la structure complète des dialogues dans un graphe interactif. Le système supporte des graphes larges (500+ nœuds), navigation fluide (zoom, pan, search, jump), édition (drag-and-drop, connexions), sélection multiple et actions contextuelles.

## Epic 3: Gestion du contexte narratif (GDD)

Les utilisateurs peuvent explorer, sélectionner et utiliser le Game Design Document (500+ pages) pour enrichir la génération de dialogues. Le système permet le browse des entités (personnages, lieux, régions), sélection manuelle/automatique, règles de contexte, budget tokens, et sync Notion (V2.0+).

## Epic 4: Validation et assurance qualité

Les utilisateurs peuvent valider la qualité, cohérence et conformité structurelle des dialogues avant export. Le système détecte orphans, cycles, nœuds vides, contradictions lore, "AI slop", context dropping, et fournit LLM judge scoring + simulation flow.

## Epic 5: Export et intégration Unity

Les utilisateurs peuvent exporter les dialogues vers Unity JSON format avec validation 100% schema conformity. Le système valide avant export, génère logs metadata, permet preview et batch export.

## Epic 6: Templates et réutilisabilité

Les utilisateurs peuvent créer, sauvegarder et réutiliser des configurations de génération (instructions, contexte, paramètres). Le système fournit templates pré-built (salutations, confrontation), marketplace (V1.5+), A/B testing (V2.5+) et partage équipe.

## Epic 7: Collaboration et contrôle d'accès

Les utilisateurs peuvent travailler en équipe avec authentification sécurisée et rôles (Admin, Writer, Viewer). Le système gère accounts, login/logout, RBAC, partage dialogues, audit logs (V1.5+).

## Epic 8: Gestion des dialogues et recherche

Les utilisateurs peuvent gérer, rechercher, filtrer et organiser leurs dialogues efficacement. Le système permet listing, recherche avancée (nom, personnage, lieu, thème), filtrage par métadonnées, tri, collections/dossiers, indexation rapide (1000+ dialogues), visualisation métadonnées, validation batch et génération batch.

## Epic 9: Variables et intégration systèmes de jeu

Les utilisateurs peuvent définir des variables et flags dans les dialogues pour créer des branches conditionnelles dynamiques. Le système permet conditions de visibilité, effets déclenchés par choix joueur, preview de scénarios, validation références, et intégration stats de jeu (V3.0+).

## Epic 10: Gestion de session et sauvegarde

Les utilisateurs peuvent sauvegarder leur travail automatiquement et récupérer leur session après crash. Le système gère auto-save (2min), session recovery, sauvegarde manuelle, détection changements non sauvegardés, et historique basique (MVP) ou détaillé (V2.0+).

## Epic 11: Onboarding et guidance

Les nouveaux utilisateurs peuvent accéder à un wizard d'onboarding pour leur première création de dialogue. Le système fournit documentation in-app, tutoriels, aide contextuelle, dialogues d'exemple, et détection du niveau de compétence pour adapter l'UI (mode guidé vs mode avancé V1.5+). Inclut variantes optimisées pour persona Mathieu (détection automatique V1.0, wizard simplifié 4 étapes V1.0, assistance contextuelle renforcée V1.0, validation premier run <30min V1.0).

## Epic 12: Expérience utilisateur et workflow

Les utilisateurs peuvent optimiser leur workflow avec preview avant génération, comparaison side-by-side de nœuds, et raccourcis clavier pour actions courantes. Le système améliore l'efficacité et réduit la friction dans le processus de création.

## Epic 13: Monitoring et analytics

Les utilisateurs peuvent monitorer les métriques de performance du système (temps génération, latence API) et visualiser les tendances dans un dashboard analytics. Le système fournit visibilité sur la santé et performance de l'application.

## Epic 14: Accessibilité

Les utilisateurs peuvent naviguer l'éditeur de graphe entièrement au clavier avec indicateurs de focus visibles. Le système supporte personnalisation contraste couleurs (WCAG AA), et lecteurs d'écran avec ARIA labels (V2.0+).

## Epic 17: Expérience mobile et responsive (web) — **done**

Les utilisateurs peuvent utiliser l’application sur navigateur mobile et tablette (viewports étroits) avec shell adaptatif, interactions tactiles sur le graphe et panneaux accessibles en patterns mobile. PWA installable en option (V1.5+). Voir [epic-17.md](epic-17.md). Refactor toolbar (ex-17.9) reporté vers l’Epic Dette technique.

## Epic Dette technique — **backlog**

Refactorings et durcissements hors livraison fonctionnelle (ex. découpage `GraphEditorHeader`, story DT-1). Voir [epic-dette-technique.md](epic-dette-technique.md).
