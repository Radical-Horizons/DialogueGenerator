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

Comptes fermés (Admin / Writer), invités lecture seule sans compte (liens), SQLite locale (`data/app.db`) pour users, préférences, index dialogues, partages et audit. Voir [epic-07.md](epic-07.md) — stories **7.0–7.9**.

## Epic 8: Gestion des dialogues et recherche

Les utilisateurs peuvent gérer, rechercher, filtrer et organiser leurs dialogues efficacement. Le système permet listing, recherche avancée (nom, personnage, lieu, thème), filtrage par métadonnées, tri, collections/dossiers, indexation rapide (1000+ dialogues), visualisation métadonnées, validation batch et génération batch.

## Epic 9: Variables et intégration systèmes de jeu

Les utilisateurs peuvent définir des variables et flags dans les dialogues pour créer des branches conditionnelles dynamiques. Le système permet conditions de visibilité, effets déclenchés par choix joueur, preview de scénarios, validation références, et intégration stats de jeu (V3.0+).

## Epic 10: Gestion de session et sauvegarde

Les utilisateurs peuvent compter sur un travail persisté en continu (store → journal IndexedDB → backend, conforme ADR-006) et récupérer leur session après un crash. Le système gère la restauration de session, la synchronisation forcée (`Ctrl+S`), l'avertissement sur changements non acquittés, et l'historique basique (MVP) ou détaillé (V2.0+).

## Epic 11: Onboarding et guidance

Les nouveaux utilisateurs peuvent accéder à un wizard d'onboarding pour leur première création de dialogue. Le système fournit documentation in-app, tutoriels, aide contextuelle, dialogues d'exemple, et détection du niveau de compétence pour adapter l'UI (mode guidé vs mode avancé V1.5+). Inclut variantes optimisées pour persona Mathieu (détection automatique V1.0, wizard simplifié 4 étapes V1.0, assistance contextuelle renforcée V1.0, validation premier run <30min V1.0).

## Epic 12: Expérience utilisateur et workflow

Les utilisateurs peuvent optimiser leur workflow avec preview avant génération, comparaison side-by-side de nœuds, et raccourcis clavier pour actions courantes. Le système améliore l'efficacité et réduit la friction dans le processus de création.

## Epic 13: Monitoring et analytics

Les utilisateurs peuvent monitorer les métriques de performance du système (temps génération, latence API) et visualiser les tendances dans un dashboard analytics. Le système fournit visibilité sur la santé et performance de l'application.

## Epic 14: Accessibilité

Les utilisateurs peuvent naviguer l'éditeur de graphe entièrement au clavier avec indicateurs de focus visibles. Le système supporte personnalisation contraste couleurs (WCAG AA), et lecteurs d'écran avec ARIA labels (V2.0+).

## Epic 17: Expérience mobile et responsive (web) — **done**

Les utilisateurs peuvent utiliser l’application sur navigateur mobile et tablette (viewports étroits) avec shell adaptatif, interactions tactiles sur le graphe et panneaux accessibles en patterns mobile. PWA installable en option (V1.5+). Voir [epic-17.md](epic-17.md). Stories **17.1–17.11 done**, rétrospective du 2026-06-20. ⚠️ Trou identifié a posteriori : aucune surface d’édition de nœud n’est montée sur viewport étroit — comblé par la story **18.10**.

## Epic 15: RLM Context Selector (sélection automatique du contexte GDD)

Les utilisateurs peuvent activer la sélection automatique du contexte GDD via un service RLM optionnel, qui explore le GDD par function calling et réduit le contexte de 20k+ à 12-15k tokens sans perte de pertinence. Toggle « Auto Selection », justifications des sélections, override/lock, fallback gracieux vers la sélection manuelle. Voir [epic-15.md](epic-15.md). ⚠️ Ses « FR1-FR8 / NFR1-NFR6 » appartiennent à l'espace de numérotation de `prd/prd-rlm-context-selector.md`, **pas** au référentiel principal.

## Epic 16: Implémentation ADR-008 — pipeline document canonique Unity JSON

Le document canonique Unity JSON devient la source de vérité partout : backend propriétaire (GET/PUT par id, revision, 409), `choiceId` stables, layout en artefact sidecar, frontend qui envoie le document et non nodes/edges. Migration one-shot, format strict v1.1.0, pas de coexistence longue. Voir [epic-16.md](epic-16.md).

## Epic 18: Édition in-situ du dialogue dans le nœud — **intégrée à Epic 20 (2026-11-20)**

Les auteurs peuvent lire et écrire le dialogue complet — réplique PNJ et réponses PJ — **directement dans le nœud sur le canvas**, par simple clic dans le texte, sans ouvrir le panneau de droite et sans action d'enregistrement (ADR-006 : éditer = sauvegarder). Le panneau de droite reste disponible pour ce qui ne tient pas dans un nœud (conditions, effets, skill checks, métadonnées). Voir [epic-18.md](epic-18.md).

⚠️ Depuis le 2026-11-20, ses stories utiles sont reprises par Epic 20 : 18.4 (reste à faire), 18.8 et 18.5a en tranche 1 bis ; 18.5b, 18.6, 18.7, 18.9 et 18.11 en tranche 2, réécrites contre la carte et le bloc de script ; 18.10 dans 20.18 ; 18.1, 18.2 et 18.3 remplacées. Le « seuil de zoom » de la première rédaction est supprimé ; la lisibilité hors sélection passe par les paliers de zoom d'Epic 20 (écrire, lire, situer).

## Epic 19: Canvas-first — surfaces à la demande (squelette) — **remplacée par Epic 20 (2026-11-20)**

Les auteurs lancent la génération, les détails GDD et les variables depuis **le nœud lui-même**, en overlays appelés à la demande ; le panneau de droite permanent disparaît et sa largeur revient au graphe. Remplacée par Epic 20 : FR129 et FR130 sont couvertes par FR133, FR137 et le retrait du panneau (story 20.15). Voir [epic-19.md](epic-19.md).

## Epic 20: Refonte « Scène » — une scène, un texte, trois vues — **validée le 2026-11-20, prioritaire**

Une scène porte sa fiche (distribution, contexte) et s'ouvre en trois vues : Script, Graphe à cartes de texte, Jouer. L'IA devient un geste dans le texte (génération, lots, réécriture, discussion avec l'IA), la technique passe en puces et en barre d'état, le panneau de droite disparaît. Malgré son numéro, elle passe devant les autres epics. Intègre les stories utiles d'Epic 18 (tranche 1 bis) et remplace Epic 19. Voir [epic-20.md](epic-20.md).
