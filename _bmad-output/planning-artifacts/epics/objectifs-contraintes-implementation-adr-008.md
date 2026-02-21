# Implémentation ADR-008 – Objectifs et contraintes (pour SM / équipe)

**Rôle du document :** Le PM et le stakeholder (Marc) fixent ici l’objectif et les contraintes. Le **découpage en user stories** (ou en jalons) est du ressort du **Scrum Master / équipe**. Ce brief sert de référence pour ce découpage.

---

## Référence

- **ADR-008** : Pipeline document canonique Unity JSON (Backend propriétaire, SoT document, choiceId, layout partagé)  
- Fichier : `_bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md`  
- Synthèse détaillée (consultant + 6 décisions) : à déposer dans `docs/architecture/` (ex. `pipeline-unity-backend-front-architecture.md`)

---

## Objectif (non négociable)

**Une seule implémentation cohérente de l’architecture ADR-008.** Pas de livraison en plusieurs epics indépendantes qui laissent le système à mi-chemin (ancien modèle + nouveau modèle). L’objectif est une **architecture propre, SOLID, KISS, DRY** : une seule source de vérité (document canonique), pas de dette technique, pas de bricolage. Le travail prend le temps qu’il faut ; on ne passe au reste qu’une fois cette base en place.

---

## Contraintes (réponses stakeholder)

| Question | Réponse |
|----------|--------|
| **Volume de données existantes à migrer** | 0 (aucun dialogue critique en production ; migration = codebase + fixtures). |
| **Risque / régression** | On vise **zéro régression** (tests, non-régression). On sait qu’il peut y en avoir ; la cible est de les éliminer. |
| **Unity** | Unity sera mis à jour **après** que l’implémentation DG soit terminée. Unity ne travaille pas en parallèle. Pas de coordination de déploiement simultané. |
| **Priorité** | **Priorité absolue.** On fait cette implémentation correctement avant de passer au reste. Pas de demi-mesure. |

---

## Périmètre de l’implémentation

L’ADR-008 couvre au minimum :

- **Document canonique** : Unity Dialogue JSON v1.1.0 (`schemaVersion`, `choices[].choiceId` requis).
- **Backend propriétaire** : persistance document (et layout), revision, conflits (409). API en document (GET/PUT), pas nodes/edges.
- **Layout partagé** : artefact distinct, persisté backend, même règles de concurrence.
- **Frontend** : SoT = document (+ layout) ; nodes/edges = projection dérivée uniquement ; identités UI stables (choiceId, pas d’index comme identité).
- **Migration** : outil one-shot choiceId ; lecture tolérante courte ; refus des docs sans choiceId pour schemaVersion >= 1.1.0.
- **Validation** : draft (non bloquant) vs export (bloquant), erreurs structurées.
- **Unity** : DTO alignés (choiceId, etc.) pour ne pas perdre de champs ; mise à jour Unity après DG.

Le découpage en **phases ou user stories** (dans une epic dédiée ou dans une epic existante) est à définir par le SM/équipe, en respectant l’objectif « une seule implémentation cohérente » (pas de livrable intermédiaire qui laisse le système dans un état hybride inmaintenable).

---

## Rôle du SM / équipe

- Proposer le **découpage** (US ou jalons) qui permet d’avancer de façon ordonnée tout en livrant l’architecture complète.
- S’assurer que chaque US est **testable** et **conforme à l’ADR-008** (référence explicite dans les critères d’acceptation).
- Ne pas créer de « bricolage » : chaque livrable doit faire progresser vers l’état cible décrit dans l’ADR, pas ajouter une couche de contournement.

---

**Document généré pour cadrer l’implémentation ADR-008. Découpage détaillé : à produire par le SM/équipe.**
