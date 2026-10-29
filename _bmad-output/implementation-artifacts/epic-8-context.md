# Epic 8 Context: Gestion des dialogues et recherche

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Cet épic donne aux auteurs les moyens de gérer efficacement une bibliothèque de centaines de dialogues : lister, rechercher, filtrer, trier, organiser en collections, consulter les métadonnées, et opérer en lot (validation et génération). L'objectif produit est de rendre la navigation et l'organisation fluides à l'échelle industrielle visée (1000+ dialogues, progression vers 1M+ lignes), afin qu'un auteur trouve et manipule le bon dialogue en quelques secondes plutôt que de se perdre dans une liste plate. C'est le socle de gestion qui rend la production à grande échelle soutenable une fois la génération (Epic 1) et la validation (Epic 4) en place.

## Stories

- Story 8.1 : Lister tous les dialogues (pagination, tri par défaut par date de modification) — FR80
- Story 8.2 : Rechercher par nom, personnage, lieu ou thème (temps réel, insensible à la casse) — FR81
- Story 8.3 : Filtrer par métadonnées (date, auteur, statut), filtres combinables — FR82
- Story 8.4 : Trier (alphabétique, date, taille), préférence persistée — FR83
- Story 8.5 : Créer des collections/dossiers (relation N-N avec les dialogues) — FR84
- Story 8.6 : Indexer les dialogues pour recherche rapide (1000+) — FR85
- Story 8.7 : Afficher les métadonnées (nombre de nœuds, coût LLM, dernière modification) — FR86
- Story 8.8 : Valider plusieurs dialogues en lot (rapport d'erreurs, progression) — FR87
- Story 8.9 : Générer en lot depuis plusieurs nœuds de départ — FR88

## Requirements & Constraints

- La liste doit être paginée côté serveur (50 éléments par page par défaut) et exposer des métadonnées de pagination (page courante, total de pages, total d'éléments).
- Recherche, filtrage et tri s'appliquent côté backend et sont composables entre eux ; le tri par défaut est la date de modification décroissante. La recherche est en temps réel, insensible à la casse, et combine les critères en ET par défaut.
- La visibilité des dialogues dépend du rôle de l'utilisateur (dépendance RBAC, Epic 7) : un lecteur ne voit que ses dialogues partagés, un administrateur voit tout et peut filtrer par n'importe quel auteur.
- Un dialogue peut appartenir à plusieurs collections ; supprimer une collection ne supprime jamais les dialogues.
- Les opérations en lot (validation, génération) doivent rapporter une progression en temps réel, tolérer les échecs individuels sans interrompre le reste, produire un rapport exploitable, et s'exécuter en arrière-plan pour les grands volumes sans bloquer l'UI.
- Performance (critères de succès) : réponses API non-LLM <200 ms (95e centile) pour lister/rechercher/consulter les métadonnées ; recherche <200 ms voire <1 s même avec 1000+ dialogues indexés ; liste <500 ms à 1000 dialogues ; chargement initial de la page interactif <3 s (FCP <1,5 s). Objectif de scalabilité : <10 % de dégradation entre 100 et 1000 dialogues.

## Technical Decisions

- Séparer les responsabilités par service métier réutilisable : gestion/listing+filtrage+tri, recherche textuelle, indexation, collections, métadonnées, validation en lot, génération en lot — plutôt qu'un service monolithique. Réutiliser les services existants pour la validation (Epic 4) et la génération unitaire (Epic 1) plutôt que réimplémenter la logique.
- L'indexation est le prérequis de performance de la recherche : l'index doit se mettre à jour automatiquement sur création, modification et suppression d'un dialogue, indexer les champs nom/personnages/lieux/thèmes/métadonnées, et offrir une réindexation complète administrateur exécutée en arrière-plan.
- Le stockage repose sur le système de fichiers (données JSON), acceptable jusqu'à ~1000 dialogues ; une migration vers une base de données est envisagée au-delà (jalon ultérieur). Concevoir les requêtes de listing/filtrage/tri pour rester indexables.
- La progression des opérations longues (validation/génération en lot) passe par streaming SSE (ou polling en repli), en cohérence avec le pattern de streaming déjà établi dans le projet.
- Le calcul des coûts LLM affichés dans les métadonnées agrège les logs de coût produits par le pipeline de génération (Epic 1) ; ne pas dupliquer ce calcul.
- Respecter les conventions établies : namespace API `/api/v1/dialogues/*` (et `/collections`, endpoints admin de réindexation), stores Zustand en mises à jour immuables, composants React et modals selon les patterns existants. Vérifier l'existant avant de créer (des composants de liste, une barre de recherche et un raccourci « / » existent partiellement).

## UX & Interaction Patterns

- Vue liste comme point d'entrée de gestion : chaque ligne expose nom, dates, taille (nombre de nœuds), coût et statut ; clic pour ouvrir dans l'éditeur ; survol pour un aperçu compact des métadonnées.
- Recherche et filtres réactifs : résultats mis à jour sans rechargement, filtres actifs matérialisés par des badges supprimables individuellement, état « aucun résultat » avec réinitialisation, indicateur de comptage des résultats.
- Persistance des préférences (tri) côté client pour retrouver son contexte d'une session à l'autre.
- Collections présentées dans une barre latérale ; ajout de dialogues via sélection multiple ; badges de collections cliquables sur un dialogue.
- Opérations en lot : sélection multiple dans la liste (ou dans le graphe pour la génération), modal de progression, rapport final exportable, possibilité d'interrompre et de relancer les éléments échoués.

## Cross-Story Dependencies

- 8.6 (indexation) conditionne les performances de 8.2 (recherche) et, indirectement, 8.3/8.4 sur grands volumes.
- 8.1 (listing) est la surface commune sur laquelle se greffent recherche (8.2), filtres (8.3), tri (8.4), métadonnées (8.7) et sélection pour les lots (8.8).
- 8.7 (métadonnées/coûts) dépend des logs de coût de l'Epic 1 (génération).
- 8.8 (validation en lot) réutilise la validation de l'Epic 4 ; 8.9 (génération en lot) réutilise la génération de l'Epic 1 et la sélection multiple du graphe (Epic 2).
- Filtrage par auteur et visibilité des dialogues dépendent du RBAC de l'Epic 7 (rôles, partage).
