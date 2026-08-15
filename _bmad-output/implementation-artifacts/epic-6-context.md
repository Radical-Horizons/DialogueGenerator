# Epic 6 Context: Templates et réutilisabilité

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Permettre de créer, sauvegarder et réappliquer une configuration de génération complète (instructions, contexte GDD, paramètres LLM) en un clic, pour couper le cold start (10+ clics → 1 clic) et standardiser la qualité narrative. Les templates ne sont pas génériques : ils embarquent la connaissance des systèmes Alteir (skill checks, réputation, flags, cut-scenes). Le noyau V1 couvre custom + pré-built + application + règles anti-context-dropping + suggestions ; marketplace (V1.5+), A/B testing (V2.5+) et partage équipe viennent ensuite.

## Stories

- Story 6.1: Créer des templates custom
- Story 6.2: Sauvegarder, éditer et supprimer
- Story 6.3: Appliquer un template à la génération
- Story 6.4: Fournir les templates pré-built Alteir
- Story 6.5: Configurer l’anti-context-dropping
- Story 6.6: Parcourir le marketplace (V1.5+)
- Story 6.7: A/B tester et scorer la qualité (V2.5+)
- Story 6.8: Partager avec l’équipe
- Story 6.9: Suggérer selon le scénario

## Requirements & Constraints

- Un template capture la config complète : instructions, IDs de contexte GDD (personnages, lieux, région), paramètres LLM, métadonnées (nom, description, catégorie, icône emoji).
- Application = point de départ éditable. Modifier un template n’altère pas les dialogues déjà créés (snapshot à l’application).
- Pré-built Alteir, lecture seule : Salutation / première rencontre, Confrontation, Révélation narrative, Négociation, Recrutement compagnon, Cut-scene, Test de caractéristique. Une édition utilisateur produit une copie custom. Chaque pré-built annonce le système GDD principal et un hint `type_scene` pour le sélecteur de contexte (Epic 15).
- Anti-context-dropping : mode **Explicite** (valeurs numériques — DD, deltas réputation — doivent figurer dans le JSON généré ; refs implicites = warnings) vs **Subtil** (lore / souvenir : refs implicites acceptées). Les règles du template pilotent la validation au moment de la génération.
- Marketplace (V1.5+) : parcourir, filtrer, copier en local. A/B (V2.5+) : comparer deux templates (score juge LLM, feedback, coût) et désigner un gagnant.
- Partage équipe : le destinataire voit une section dédiée ; une mise à jour de l’auteur se propage ; révoquer retire l’accès sauf copie locale.
- Suggestions : prioriser selon type de scène, personnages, mots-clés d’instructions et flags GDD (ex. première rencontre si le flag de rencontre n’est pas posé) ; afficher score et raison.
- Chargement / liste templates : API non-LLM < 200 ms. Stockage local scalable (même ordre de grandeur que 1000+ dialogues).
- Les dialogues issus d’un template passent le **même** validateur d’export Unity qu’Epic 5 — pas de second gate. Une sérialisation d’export non normalisée (deltas null, choix/conditions vides) ferait exploser le taux d’échec une fois les templates utilisés.

## Technical Decisions

- Router dédié `/api/v1/templates` (CRUD, chargement, plus tard suggestions / marketplace / A/B). Ne pas étendre le router dialogues.
- Fichiers JSON locaux, nommage UUID, Git-friendly. Stocker des **IDs GDD uniquement**, jamais le contenu des fiches. Validation **lazy au chargement** : refs obsolètes → warning + « Charger quand même » (refs ignorées), jamais d’erreur bloquante à la sauvegarde.
- Réutiliser le catalogue d’instructions de scène existant pour les pré-built ; ne pas en créer un parallèle. Étendre le modèle preset (config + métadonnées) avec params LLM, règles anti-drop, `gdd_system` et `scene_type_hint`.
- Partage / marketplace s’appuient sur les identités Epic 7 ; hors V1. A/B réutilise le juge qualité Epic 4, pas un second scorer.
- QA template : réutiliser preview / validation document Epic 5, sans nouveau validateur.

## UX & Interaction Patterns

- Sauvegarde : modal nom + description + catégorie + emoji + aperçu lecture seule. Édition : mêmes champs pré-remplis. Suppression : confirmation explicite.
- Sélecteur en 1 clic, sections Pré-built / Mes templates (puis Partagés / Marketplace). Après chargement, tous les champs restent modifiables. Grouper et filtrer par nom, catégorie, contexte.
- Refs GDD cassées : modal d’avertissement, Annuler (primaire) ou Charger quand même.
- Suggestions en tête de liste, badge « Suggéré pour votre contexte », score + raison ; 1 clic pour accepter.
- UI dense dès 6.1 : tokens chrome responsive + détection narrow ; sélecteur mobile en drawer / combobox / plein écran, pas un overlay desktop compressé. Cibles tactiles cohérentes avec le chrome existant.

## Cross-Story Dependencies

- 6.1 → 6.2 (CRUD) et 6.3 (appliquer). 6.3 est le socle de 6.4, 6.5, 6.9. 6.4 peut être copié vers un custom (6.1). 6.6 et 6.8 après identités / partage Epic 7. 6.7 après juge qualité Epic 4, phase V2.5+.
- Epic 1 : génération + log du `template_id`. Epic 3 : contexte GDD embarqué. Epic 0 : presets et validation de refs. Epic 4 : détection context-dropping. Epic 5 : validateur / preview export. Epic 15 : hints `type_scene` pour le RLM. Epic 17 : patterns responsive déjà livrés, à appliquer dès la première story UI.
