# Epic Index

- **Epic 0**: [Infrastructure & Setup (Brownfield Adjustments)](epic-00.md)  
  Les utilisateurs peuvent travailler sur une application stable avec l'infrastructure technique nécessaire. Le système configure ADR-001 à ADR-004 (Progress Modal SSE, Presets, Graph Fixes, Multi-Provider LLM), ID-001 à ID-005 (Auto-save, Validation cycles, Cost governance, Streaming cleanup, Preset validation).

- **Epic 0.9**: [Production Readiness (Pre-Launch Polish)](epic-00-9.md)  
  Les utilisateurs peuvent utiliser une application stable, fluide et prête pour la production. Le système élimine les derniers bugs de comportement, optimise l'expérience utilisateur, et s'assure que l'application est organisée et prête pour le déploiement.

- **Implémentation ADR-008** (priorité absolue) : [Objectifs et contraintes](objectifs-contraintes-implementation-adr-008.md)  
  Une seule implémentation cohérente de l’architecture pipeline document canonique (backend propriétaire, SoT document, choiceId, layout partagé). Découpage en US ou jalons : **Scrum Master / équipe**. Référence : ADR-008 dans `architecture/v10-architectural-decisions-adrs.md`.

- **Epic 1**: [Génération de dialogues assistée par IA](epic-01.md)  
  Les utilisateurs peuvent générer des nœuds de dialogue de qualité professionnelle avec assistance LLM, gérer les coûts et itérer rapidement. Le système permet la génération single/batch, l'édition manuelle, l'auto-link, et fournit transparence complète sur les coûts et prompts utilisés.

- **Epic 2**: [Éditeur de graphe de dialogues](epic-02.md)  
  Les utilisateurs peuvent visualiser, naviguer et éditer la structure complète des dialogues dans un graphe interactif. Le système supporte des graphes larges (500+ nœuds), navigation fluide (zoom, pan, search, jump), édition (drag-and-drop, connexions), sélection multiple et actions contextuelles.

- **Epic 3**: [Gestion du contexte narratif (GDD)](epic-03.md)  
  Les utilisateurs peuvent explorer, sélectionner et utiliser le Game Design Document (500+ pages) pour enrichir la génération de dialogues. Le système permet le browse des entités (personnages, lieux, régions), sélection manuelle/automatique, règles de contexte, budget tokens, et sync Notion (V2.0+).

- **Epic 4**: [Validation et assurance qualité](epic-04.md)  
  Les utilisateurs peuvent valider la qualité, cohérence et conformité structurelle des dialogues avant export. Le système détecte orphans, cycles, nœuds vides, contradictions lore, "AI slop", context dropping, et fournit LLM judge scoring + simulation flow.

- **Epic 5**: [Export et intégration Unity](epic-05.md)  
  Les utilisateurs peuvent exporter les dialogues vers Unity JSON format avec validation 100% schema conformity. Le système valide avant export, génère logs metadata, permet preview et batch export.

- **Epic 6**: [Templates et réutilisabilité](epic-06.md)  
  Les utilisateurs peuvent créer, sauvegarder et réutiliser des configurations de génération (instructions, contexte, paramètres). Le système fournit templates pré-built (salutations, confrontation), marketplace (V1.5+), A/B testing (V2.5+) et partage équipe.

- **Epic 7**: [Collaboration et contrôle d'accès](epic-07.md)  
  Les utilisateurs peuvent travailler en équipe avec authentification sécurisée et rôles (Admin, Writer, Viewer). Le système gère accounts, login/logout, RBAC, partage dialogues, audit logs (V1.5+).

- **Epic 8**: [Gestion des dialogues et recherche](epic-08.md)  
  Les utilisateurs peuvent gérer, rechercher, filtrer et organiser leurs dialogues efficacement. Le système permet listing, recherche avancée (nom, personnage, lieu, thème), filtrage par métadonnées, tri, collections/dossiers, indexation rapide (1000+ dialogues), visualisation métadonnées, validation batch et génération batch.

- **Epic 9**: [Variables et intégration systèmes de jeu](epic-09.md)  
  Les utilisateurs peuvent définir des variables et flags dans les dialogues pour créer des branches conditionnelles dynamiques. Le système permet conditions de visibilité, effets déclenchés par choix joueur, preview de scénarios, validation références, et intégration stats de jeu (V3.0+).

- **Epic 10**: [Gestion de session et sauvegarde](epic-10.md)  
  Les utilisateurs peuvent sauvegarder leur travail automatiquement et récupérer leur session après crash. Le système gère auto-save (2min), session recovery, sauvegarde manuelle, détection changements non sauvegardés, et historique basique (MVP) ou détaillé (V2.0+).

- **Epic 11**: [Onboarding et guidance](epic-11.md)  
  Les nouveaux utilisateurs peuvent accéder à un wizard d'onboarding pour leur première création de dialogue. Le système fournit documentation in-app, tutoriels, aide contextuelle, dialogues d'exemple, et détection du niveau de compétence pour adapter l'UI (mode guidé vs mode avancé V1.5+). Inclut variantes optimisées pour persona Mathieu (détection automatique V1.0, wizard simplifié 4 étapes V1.0, assistance contextuelle renforcée V1.0, validation premier run <30min V1.0).

- **Epic 12**: [Expérience utilisateur et workflow](epic-12.md)  
  Les utilisateurs peuvent optimiser leur workflow avec preview avant génération, comparaison side-by-side de nœuds, et raccourcis clavier pour actions courantes. Le système améliore l'efficacité et réduit la friction dans le processus de création.

- **Epic 13**: [Monitoring et analytics](epic-13.md)  
  Les utilisateurs peuvent monitorer les métriques de performance du système (temps génération, latence API) et visualiser les tendances dans un dashboard analytics. Le système fournit visibilité sur la santé et performance de l'application.

- **Epic 14**: [Accessibilité](epic-14.md)  
  Les utilisateurs peuvent naviguer l'éditeur de graphe entièrement au clavier avec indicateurs de focus visibles. Le système supporte personnalisation contraste couleurs (WCAG AA), et lecteurs d'écran avec ARIA labels (V2.0+).

