# Core User Experience

> ⚠️ **Remplacée le 2026-11-20 pour tout écran repris par l'epic 20 (refonte « Scène »).** Font foi :
> [`docs/design/refonte-scene/README.md`](../../../docs/design/refonte-scene/README.md) (écrans, composants,
> raccourcis, table « où va chaque fonction »), les boards `docs/design/refonte-scene/*.dc.html`,
> [`docs/architecture/refonte-scene-architecture.md`](../../../docs/architecture/refonte-scene-architecture.md)
> (A1–A16) et [`epic-20.md`](../epics/epic-20.md). En cas de contradiction, la refonte l'emporte. Restent valables :
> la charte de `design-system-foundation.md` (couleurs, polices, filets, un seul bouton bleu) et les exigences
> d'accessibilité générales. Ce document est conservé pour l'historique ; ne pas en tirer de critère d'acceptation.

## Defining Experience

L'expérience cœur du Graph Editor est : **"Generate Next" — prolonger un dialogue à partir d'un point précis du graphe, de façon itérative et rapide**, sans perdre le contexte.

**Core loop (répétée en continu sur le même dialogue) :**
- Sélectionner un nœud "point d'ancrage" dans le graphe
- Lancer **"Generate Next"** (via modal) — action unifiée pour tous les cas
- Choisir la/les cibles PJ auxquelles le PNJ répond (1 choix spécifique / plusieurs / tous)
- Générer le(s) nœud(s) résultat(s) avec **auto-apply des connexions** (`targetNode`/`nextNode` remplis automatiquement)
- Sauvegarder (auto-save toutes les 2min, suspendu pendant génération)
- **Auto-focus** : zoom/center automatique vers nouveau nœud généré (ou premier en batch)
- Reboucler (souvent sans re-sélectionner le dialogue)

**Action critique à rendre fluide :**
**"Generate Next for target(s)"** — générer la suite à partir d'une/plusieurs cibles PJ choisies, en gardant le focus et le contexte.

**Parité fonctionnelle (Story 0.5.5) :**
Toutes les fonctionnalités de génération doivent être disponibles **identiquement** dans l'éditeur de graphe ET l'éditeur de dialogue :
- Génération pour choix spécifique
- Génération batch pour tous les choix
- Génération nextNode pour navigation linéaire
- Même modal progression, même streaming, même auto-apply connexions

## Platform Strategy

**Plateforme :** Web React (architecture existante, pas de changement prévu)

**Mode d'interaction :**
- Souris/clavier (pas de tactile)
- Écran d'ordinateur par défaut
- Pas de contraintes d'accessibilité mobile pour l'instant

**Contraintes techniques :**
- Architecture React existante à respecter
- Pas de refonte majeure, itérations progressives uniquement
- Patterns existants à respecter (Zustand stores, FastAPI routers, React modals)

## Effortless Interactions

**Interaction à rendre quasi automatique : "Generate Next for target(s)"**

**Ciblage PJ explicite (Story 0.5.5) :**
- **Une cible** : Générer pour un choix PJ spécifique
- **Multi-cibles** : Générer pour plusieurs choix sélectionnés
- **Tous** : Générer pour tous les choix sans `targetNode` (mode batch first-class)

**Réduire la friction de sélection :**
- Defaults intelligents : dernière cible réutilisée, "tous" persistent
- Multi-select ergonomique (checkboxes visibles)
- Feedback immédiat : "X choix(s) déjà connecté(s), Y nouveau(x) nœud(s) généré(s)"

**Limiter les changements de contexte :**
- Rester sur le même dialogue (pas de re-sélection)
- Conserver sélection/zoom/panneau/options du modal entre itérations
- Auto-focus après génération : zoom vers nouveau nœud (graphe) ou focus dans liste (dialogue editor)

**Feedback immédiat :**
- Preview de ce qui va être généré (quelles cibles, combien de nœuds)
- Progression lisible ("Génération 2/5..." si batch)
- Annulation/retry clairs

**Barre 4 résultats de test (nouvelle fonctionnalité) :**
- **Mode compact** : 4 ronds colorés seulement (rouge → jaune → vert → bleu), labels en infobulle au survol
- **Mode explicite au hover/selection** : Afficher temporairement les libellés + highlight du chemin
- Traiter comme "fan-out connector" : même comportement que "Generate Next" (auto-apply connexions)

## Critical Success Moments

Basés sur les failure modes du PRD et Epic 0 :

**1. Cible(s) PJ correctement choisie(s)**
- Si erreur → génération "à côté", perte de temps
- Solution : Preview claire avant génération, feedback "X déjà connectés"

**2. Résultat généré utilisable**
- Critère PRD : **80%+ nœuds acceptés sans modification**
- Si échec → re-génération, frustration
- Solution : Qualité prompt + contexte, retry facile

**3. Raccord correct visible**
- L'utilisateur doit voir immédiatement où ça se branche
- Solution : **Auto-apply connexions** (`auto_apply: true`), highlight automatique

**4. Sauvegarde fiable**
- Zero data loss (PRD NFR-R3)
- Solution : Auto-save 2min (suspendu pendant génération), session recovery

**5. Pas d'UI freeze / LLM fail**
- PRD : Génération <30s, pas de freeze
- Solution : Streaming visible, retry clair, statut génération toujours visible

## Experience Principles

**1. Loop-first : "Generate Next" unifié**
   - Toute friction dans "sélection → cible(s) → génération → auto-apply → save → auto-focus" est prioritaire
   - Même terminologie et UX partout : "Generate Next" (pas "créer nœud")

**2. State persistence & continuity**
   - Le focus (dialogue, nœud, zoom, options) ne doit pas se perdre entre itérations
   - Auto-save suspendu pendant génération (ID-001)
   - Session recovery automatique

**3. Targeting clarity**
   - L'utilisateur sait toujours *à quelle(s) cible(s) PJ* le PNJ répond, avant de générer
   - Preview explicite : "Générer pour 3 choix" vs "Générer pour tous (5 choix)"
   - Feedback "X déjà connectés / Y générés"

**4. Auto-apply & trust**
   - Connexions appliquées automatiquement (`auto_apply: true` dans Story 0.5.5)
   - Retry, annulation, pas de duplication
   - L'utilisateur garde confiance dans l'outil

**5. Parité Graphe ↔ Dialogue Editor**
   - Mêmes fonctionnalités des deux côtés (Story 0.5.5)
   - Même UX, même modal, même auto-apply
   - Focus automatique adapté (zoom graphe vs focus liste)

**6. Resilience & feedback**
   - Validation structure non-bloquante mais actionnable (cycles, orphans, stableID)
   - Warnings cliquables → zoom → highlight
   - Retry clair, statut toujours visible
