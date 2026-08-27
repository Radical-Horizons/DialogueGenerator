# Epic 6 Context: Templates et réutilisabilité

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Permettre de créer, sauvegarder et réappliquer en un clic une configuration de génération complète (instructions, contexte GDD, paramètres LLM), pour couper le cold start (10+ clics → 1 clic) et standardiser la qualité narrative. Les templates ne sont pas neutres : ils embarquent la connaissance des systèmes Alteir (skill checks, réputation, flags, cut-scenes), et un template pré-built porte le système GDD qu'il mobilise. **Révision du 2026-08-21 (fait autorité, prime sur toute formulation antérieure)** : le partage n'est plus une action dirigée vers des personnes mais un **statut porté par l'élément** — `partagé` (visible de toute l'équipe, **défaut**) ou `privé` (brouillon du seul propriétaire). Cette décision retire le partage nominatif et le marketplace, et impose au sélecteur **une liste unique** avec pastille par ligne et filtre au-dessus — jamais des sections empilées.

## Stories

- Story 6.1: Créer des templates custom
- Story 6.2: Sauvegarder, éditer et supprimer
- Story 6.3: Appliquer un template à la génération
- Story 6.4: Fournir les templates pré-built Alteir
- Story 6.5: Configurer l'anti-context-dropping
- Story 6.6: Marketplace — **hors périmètre** (retirée par la révision)
- Story 6.7: A/B tester et scorer la qualité (V2.5+)
- Story 6.8: Choisir la visibilité d'un template (réécrite)
- Story 6.9: Suggérer selon le scénario

## Requirements & Constraints

- Un template capture la configuration complète : instructions, IDs de contexte GDD (personnages, lieux, région), paramètres LLM, métadonnées (nom, description, catégorie, icône emoji).
- Appliquer un template = point de départ éditable. Modifier un template n'altère pas les dialogues déjà créés (snapshot au moment de l'application) ; seuls les nouveaux en bénéficient.
- Pré-built Alteir, lecture seule, une édition produit une copie custom : Salutation / première rencontre, Confrontation, Révélation narrative, Négociation, Recrutement compagnon, Cut-scene, Test de caractéristique. Chacun annonce son système GDD principal et un hint `type_scene` exploité par le sélecteur de contexte intelligent.
- Anti-context-dropping : mode **Explicite** (les valeurs numériques — DD, deltas réputation — doivent figurer dans le JSON généré ; références implicites = warnings) vs **Subtil** (lore, souvenir : références implicites acceptées). Les règles du template pilotent la validation au moment de la génération.
- **Visibilité** : `partagé` par défaut, aucune action de partage requise ni proposée. Seul le propriétaire bascule sur `privé` ; toute tentative par un tiers est refusée avec un message explicite. Un template sans propriétaire connu (antérieur au modèle) reste lisible par tous et modifiable par un administrateur seul.
- Un template partagé par un collègue s'applique exactement comme les siens, mais ne se modifie ni ne se supprime ; son propriétaire est visible sur la ligne.
- Suggestions : prioriser selon type de scène, personnages, mots-clés d'instructions et flags GDD (ex. « première rencontre » si le flag de rencontre n'est pas encore posé) ; afficher score de pertinence et raison.
- Chargement et listage : endpoints non-LLM sous 200 ms au 95e centile ; stockage dimensionné pour le même ordre de grandeur que 1000+ dialogues.
- A/B testing (V2.5+) : comparer deux templates via le juge qualité existant (scores, coûts, temps), désigner un gagnant, historiser. Fermé aux sessions invitées.
- Les dialogues issus d'un template passent le **même** validateur d'export Unity que le reste — pas de second gate.

## Technical Decisions

- Router dédié `/api/v1/templates` (CRUD, chargement, suggestions, A/B). Ne pas étendre le router dialogues.
- `visibility` (`shared` | `private`) est **persisté sur l'objet**, `shared` par défaut. `relation` (`owned` | `team` | `legacy`) est **calculé pour le lecteur** et **jamais persisté** : le même template vaut `owned` pour son auteur et `team` pour un collègue. Ne pas confondre les deux notions.
- **Une seule implémentation d'ACL**, partagée avec les profils d'auteur. Pas de table de partage nominatif, pas de destinataires, pas de révocation.
- Stocker des **IDs GDD uniquement**, jamais le contenu des fiches. Validation **lazy au chargement** : références obsolètes → warning + « Charger quand même », jamais d'erreur bloquante à la sauvegarde.
- Réutiliser le catalogue d'instructions de scène existant pour les pré-built ; ne pas en créer un parallèle. Étendre le modèle preset (configuration + métadonnées) avec paramètres LLM, règles anti-drop, système GDD et hint de type de scène.
- Un template ou un profil nommé est un **objet serveur**. Le stockage navigateur ne convient qu'à l'état d'un champ en cours de saisie.
- L'A/B réutilise le juge qualité existant, pas un second scorer ; la QA de template réutilise la preview / validation document, sans nouveau validateur.
- Le `template_id` utilisé est tracé dans les logs de génération pour rattacher chaque dialogue à sa source.
- Couverture de test explicitement exigée : « un template partagé d'un collègue **est visible dans la liste** ». C'est le scénario nominal depuis que `partagé` est le défaut, et son absence a déjà laissé passer une régression le rendant invisible.

## UX & Interaction Patterns

- **Une seule liste**, réunissant catalogue fourni, mes templates et ceux de l'équipe. Chaque ligne porte une **pastille** (statut + provenance) ; un **filtre** au-dessus restreint par provenance ou statut, réversible sans rechargement. **Interdit** : sections empilées type « Pré-built » / « Partagés » / « Mes templates ». Découper une liste par un critère qui n'intéresse pas l'utilisateur (lieu de stockage, visibilité) est précisément l'erreur que cet epic devait supprimer.
- Sauvegarde : modal nom + description + catégorie + emoji + aperçu lecture seule. Édition : mêmes champs pré-remplis, mise à jour sans duplication. Suppression : confirmation explicite.
- Sélection en 1 clic, puis tous les champs restent modifiables. Recherche temps réel (pas de submit), bouton d'effacement, messages pour résultats vides.
- Références GDD cassées : modal d'avertissement, Annuler en action primaire, « Charger quand même » en secondaire (références invalides ignorées).
- Suggestions en tête de liste, badge « Suggéré pour votre contexte », score et raison affichés, acceptation en 1 clic.
- Responsive dès la première story UI : détection narrow, sélecteur en drawer / plein écran sur mobile plutôt qu'un overlay desktop compressé, cibles tactiles 44×44 minimum sur le chrome.

## Cross-Story Dependencies

- 6.1 → 6.2 (CRUD) et 6.3 (appliquer). 6.3 est le socle de 6.4, 6.5 et 6.9. 6.4 se copie vers un custom via 6.1.
- 6.8 conditionne l'affichage de 6.2 et 6.4 : leurs critères de liste s'alignent sur la liste unique. 6.1, 6.3, 6.5, 6.7 et 6.9 sont inchangées par la révision.
- 6.8 s'appuie sur les identités et l'ACL de l'epic collaboration / contrôle d'accès. 6.7 dépend du juge qualité de l'epic validation, phase V2.5+.
- Dépendances externes : génération et logs (epic 1), contexte GDD embarqué (epic 3), presets et validation de références (epic 0), détection de context-dropping (epic 4), validateur / preview d'export (epic 5), hints de type de scène pour le sélecteur autonome (epic 15), patterns responsive déjà livrés (epic 17). Cet epic alimente à son tour l'onboarding.
