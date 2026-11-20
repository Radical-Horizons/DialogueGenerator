# 2. Core User Experience

> ⚠️ **Remplacée le 2026-11-20 pour tout écran repris par l'epic 20 (refonte « Scène »).** Font foi :
> [`docs/design/refonte-scene/README.md`](../../../docs/design/refonte-scene/README.md) (écrans, composants,
> raccourcis, table « où va chaque fonction »), les boards `docs/design/refonte-scene/*.dc.html`,
> [`docs/architecture/refonte-scene-architecture.md`](../../../docs/architecture/refonte-scene-architecture.md)
> (A1–A16) et [`epic-20.md`](../epics/epic-20.md). En cas de contradiction, la refonte l'emporte. Restent valables :
> la charte de `design-system-foundation.md` (couleurs, polices, filets, un seul bouton bleu) et les exigences
> d'accessibilité générales. Ce document est conservé pour l'historique ; ne pas en tirer de critère d'acceptation.

## 2.1 Defining Experience

**Expérience centrale globale :**
**"La génération de dialogues à embranchements par IA, pilotée par un auteur"**

**Expérience centrale spécifique au graphe :**
**"La visualisation et la génération de dialogues à embranchements par IA, pilotée par un auteur"**

**Description détaillée :**

DialogueGenerator permet aux auteurs de générer des dialogues complets (centaines de nœuds) en ≤1H grâce à l'assistance IA, tout en conservant le contrôle créatif total. L'expérience centrale est le workflow itératif **"Generate Next"** : prolonger un dialogue à partir d'un point précis du graphe, de façon rapide et fluide, sans perdre le contexte.

**Core loop (répétée en continu sur le même dialogue) :**
1. **Sélection** : Sélectionner un nœud "point d'ancrage" dans le graphe
2. **Génération** : Lancer **"Generate Next"** (via modal) — action unifiée pour tous les cas
3. **Ciblage** : Choisir la/les cibles PJ auxquelles le PNJ répond (1 choix spécifique / plusieurs / tous)
4. **Résultat** : Générer le(s) nœud(s) résultat(s) avec **auto-apply des connexions** (`targetNode`/`nextNode` remplis automatiquement)
5. **Sauvegarde** : Auto-save toutes les 2min (suspendu pendant génération)
6. **Focus** : **Auto-focus** : zoom/center automatique vers nouveau nœud généré (ou premier en batch)
7. **Rebouclage** : Reboucler (souvent sans re-sélectionner le dialogue)

**Action critique à rendre fluide :**
**"Generate Next for target(s)"** — générer la suite à partir d'une/plusieurs cibles PJ choisies, en gardant le focus et le contexte.

## 2.2 User Mental Model

**Comment les auteurs pensent à cette tâche :**

**Avant DialogueGenerator :**
- Création manuelle dans Word/Excel ou outils spécialisés (Articy Draft X)
- Processus lent et itératif (écrire chaque branche manuellement)
- Difficulté à visualiser la structure complète d'un dialogue complexe
- Risque de perdre le fil narratif dans les embranchements multiples

**Attentes avec DialogueGenerator :**
- **Contrôle créatif** : L'auteur garde le contrôle total, l'IA est un assistant
- **Itération rapide** : Générer, sélectionner, générer (suite) — workflow fluide
- **Visualisation claire** : Le graphe aide à comprendre la structure et naviguer
- **Qualité constante** : L'IA propose des dialogues pertinents et cohérents (80%+ acceptés sans modification)

**Modèle mental du workflow :**
- **Sélection contexte** → **Génération** → **Sélection résultat** → **Génération suite**
- L'auteur "pilote" l'IA en choisissant les cibles et validant les résultats
- Le graphe est à la fois un outil de **navigation** (voir où on en est) et d'**édition** (modifier directement)

**Points de confusion potentiels :**
- **Complexité du graphe** : Risque de se perdre dans un graphe avec 100+ nœuds
  - Solution : Auto-focus, minimap, navigation claire
- **Compréhension des suggestions IA** : L'auteur doit comprendre pourquoi l'IA propose tel dialogue
  - Solution : Preview contexte utilisé, feedback clair
- **Navigation entre branches** : Passer d'une branche à l'autre sans perdre le contexte
  - Solution : State persistence, auto-focus adaptatif

## 2.3 Success Criteria

**Critères de succès pour l'expérience centrale :**

**1. Qualité de génération (Priorité #1)**
- **Taux d'acceptation** : >80% nœuds générés acceptés sans re-génération
- **Taux de re-génération** : <20% (indicateur qualité inversé)
- **Cohérence narrative** : L'IA capture la voix du personnage et la lore sans expliciter
- **Critère PRD** : 80%+ nœuds acceptés sans modification

**2. Efficacité productive (Priorité #2)**
- **Temps génération 1 nœud** : <30s (prompt + LLM + validation)
- **Temps génération batch (3-8 nœuds)** : <2min
- **Temps production dialogue complet** : <4H (objectif initial), <2H (optimisé)
- **Critère PRD** : Production dialogue complet (100+ nœuds) en <4H

**3. Fluidité du workflow**
- **"Generate Next" unifié** : Toute friction dans "sélection → cible(s) → génération → auto-apply → save → auto-focus" est prioritaire
- **State persistence** : Le focus (dialogue, nœud, zoom, options) ne se perd pas entre itérations
- **Auto-apply connexions** : Connexions appliquées automatiquement (`auto_apply: true`)
- **Zero data loss** : Auto-save 2min (suspendu pendant génération), session recovery

**4. Contrôle créatif**
- **L'auteur pilote** : Ratio contrôle auteur / suggestions IA = 70/30 (auteur décide, IA suggère)
- **Preview claire** : L'auteur sait toujours *à quelle(s) cible(s) PJ* le PNJ répond, avant de générer
- **Retry facile** : Re-génération simple si résultat non satisfaisant
- **Édition manuelle** : Possibilité de créer/éditer des nœuds sans IA

**5. Visualisation efficace**
- **Graphe lisible** : Graphe 500+ nœuds : rendering <1s (PRD NFR-P1)
- **Navigation claire** : Auto-focus, minimap, zoom/pan fluides
- **Structure visible** : L'auteur comprend la structure du dialogue d'un coup d'œil

**Indicateurs de succès utilisateur :**
- **"Ça fonctionne"** : L'auteur dit "c'est fluide" ou "je produis en 1H ce qui me prenait une semaine"
- **Concentration & Flow** : L'auteur entre dans un état de concentration profonde où l'outil disparaît
- **Confiance** : L'auteur itère rapidement sans craindre de perdre le contrôle ou les données
- **Satisfaction IA** : "L'IA a capturé la voix du personnage !" (émotion ciblée PRD)

## 2.4 Novel UX Patterns

**Patterns établis (familiers, pas d'apprentissage nécessaire) :**

1. **Éditeur de graphe** (comme Articy Draft X, Miro)
   - Nodes, edges, zoom/pan, minimap
   - Familiarité : Les auteurs connaissent les éditeurs de graphes

2. **Génération IA** (comme ChatGPT, Midjourney)
   - Prompt → Génération → Sélection résultat
   - Familiarité : Les auteurs connaissent les outils IA

3. **Workflow itératif** (générer → sélectionner → générer)
   - Pattern classique d'outils créatifs
   - Familiarité : Workflow naturel pour les auteurs

**Patterns novateurs (nécessitent un apprentissage léger) :**

1. **Barre 4 résultats (hub visuel pour tests)**
   - **Nouveauté** : Visualisation compacte des 4 résultats de test (échec critique, échec, réussite, réussite critique)
   - **Apprentissage** : Légère courbe d'apprentissage (labels en infobulle au hover)
   - **Métaphore** : Barre de résultats comme "hub de branchement" (similaire aux hubs Articy Draft X)
   - **Solution** : Progressive disclosure (ronds colorés seulement, labels au hover)

2. **Génération batch ("générer tous les choix")**
   - **Nouveauté** : Générer plusieurs nœuds (3-8) en une passe
   - **Apprentissage** : Minimal (bouton visible, feedback progression)
   - **Métaphore** : "Générer tous" comme action first-class (pas cachée)
   - **Solution** : Bouton visible, preview "Générer pour 3 choix" vs "Générer pour tous (5 choix)"

3. **Auto-apply connections (connexions automatiques)**
   - **Nouveauté** : Connexions appliquées automatiquement sans confirmation
   - **Apprentissage** : Minimal (highlight automatique, feedback clair)
   - **Métaphore** : "L'outil fait le travail pour moi" (trust)
   - **Solution** : Highlight automatique, feedback "X déjà connectés / Y générés"

**Stratégie d'enseignement :**
- **Onboarding léger** : Tooltips contextuels, pas de tutoriel lourd
- **Feedback immédiat** : L'auteur voit immédiatement le résultat (auto-apply, highlight)
- **Découverte progressive** : Patterns novateurs révélés au besoin (hover, contexte)

## 2.5 Experience Mechanics

**Décomposition étape par étape du workflow "Generate Next" :**

**1. Initiation**

**Comment l'auteur démarre :**
- **Sélection contexte** : Sélectionner personnages, lieux, thèmes dans le panneau gauche
- **Sélection dialogue** : Cliquer sur un dialogue dans la liste (ou rester sur le même)
- **Sélection nœud** : Cliquer sur un nœud dans le graphe (point d'ancrage)

**Ce qui invite à commencer :**
- Nœud avec choix PJ non développés (handles visibles, feedback visuel)
- Bouton "Generate Next" visible sur le nœud sélectionné
- Modal de génération s'ouvre avec options claires

**2. Interaction**

**Ce que l'auteur fait :**
- **Choisir cible(s) PJ** : Sélectionner 1 choix spécifique / plusieurs / tous dans la modal
- **Configurer génération** : Instructions optionnelles (tone, style, theme)
- **Lancer génération** : Cliquer "Générer" (ou "Générer tous" pour batch)

**Comment le système répond :**
- **Modal progression** : Affiche progression (streaming visible)
- **Génération en temps réel** : Streaming du texte généré (feedback immédiat)
- **Preview avant validation** : Affiche le nœud généré avant acceptation
- **Auto-apply connexions** : Connexions appliquées automatiquement (`targetNode`/`nextNode`)

**3. Feedback**

**Comment l'auteur sait qu'il progresse :**
- **Progression visible** : Modal affiche "Génération en cours... 2/5 nœuds"
- **Graphe qui grandit** : Nouveaux nœuds apparaissent dans le graphe
- **Indicateur de complétude** : Feedback "X choix connectés / Y restants"
- **Qualité visible** : Nœud généré affiché avec preview

**Que se passe-t-il en cas d'erreur :**
- **Retry facile** : Bouton "Re-générer" visible, pas de friction
- **Message clair** : "Génération échouée : [raison]" avec action suggérée
- **Fallback automatique** : Multi-provider LLM (OpenAI → Anthropic si échec)
- **Statut toujours visible** : Indicateur de génération jamais caché

**4. Completion**

**Comment l'auteur sait qu'il a terminé :**
- **Tous les choix connectés** : Feedback "Tous les choix ont des réponses"
- **Graphe "complet"** : Validation structure (pas d'orphans, cycles détectés)
- **Export Unity réussi** : JSON validé, 0 erreurs

**Qu'est-ce qui vient après :**
- **Auto-focus** : Zoom/center automatique vers nouveau nœud généré
- **Rebouclage** : L'auteur peut immédiatement générer la suite (souvent sans re-sélectionner)
- **Édition optionnelle** : L'auteur peut éditer le nœud généré si besoin
