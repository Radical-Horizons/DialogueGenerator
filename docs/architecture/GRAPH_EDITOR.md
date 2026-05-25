# Éditeur de Graphe Narratif - Guide Utilisateur

## Vue d'ensemble

L'éditeur de graphe narratif permet de visualiser, éditer et gérer les dialogues Unity JSON sous forme de graphe interactif. Inspiré d'Articy:Draft X, il transforme l'outil de génération de dialogues en un véritable IDE narratif.

## Accès

- **URL** : `/graph-editor` (vue **standalone** : canvas + liste des dialogues, **sans** panneau d’édition de nœud intégré au même layout que ci-dessous)
- **Dashboard** : onglet central **« 📊 Éditeur de Graphe »** — graphe au centre, **panneau droit « Édition de nœud »** pour speaker, ligne, choix, **comboboxes de cibles**, etc.
- **Raccourci clavier** : `Ctrl+4` depuis n'importe quelle page

> **Suivi (2026-03)** : décisions détaillées (sélecteurs de cibles branchés sur le store, merge formulaire, resync, implications tests E2E) → [`adr-graph-connection-targets-ui-shell.md`](./adr-graph-connection-targets-ui-shell.md).

## Interface

### Layout Principal

**Dashboard (onglet graphe)** — schéma représentatif :

```
+--------------------------------------------------+
| Header (titre, actions)                          |
+--------------------------------------------------+
| Liste Unity | Canvas (Graphe)  | Panel Édition   |
|             |                  | (nœud sélec.)   |
|             | [Graphe]         |                 |
|             | Minimap          |                 |
+--------------------------------------------------+
```

**Page `/graph-editor` (standalone)** : pas de colonne « Panel Édition » dans cette vue ; édition texte/connexions via le **Dashboard** (voir ADR ci-dessus).

### Header

- **Titre** : Éditable, nom du dialogue
- **Retour** : Retour au dashboard
- **Auto-layout** : Organise automatiquement les nœuds (Ctrl+L)
- **Valider** : Vérifie le graphe (Ctrl+K)
- **Sauvegarder** : Sauvegarde en Unity JSON (Ctrl+S)
- **Exporter Unity** : Télécharge le JSON Unity courant (voir `exportToUnity` côté store)
- **Qualité** : Actions « AI slop », **Context dropping** (analyse statique vs sélections GDD), éditeur de **règles** anti-context-dropping (persistées côté API). Nécessitent une session **JWT** valide (même contrat que le reste du graphe).

### Canvas

- **Zoom** : Molette ou controls (coin bas-gauche)
- **Pan** : Clic + drag sur le fond
- **Minimap** : Vue d'ensemble (coin bas-droite)
- **Snap to Grid** : Alignement automatique

### Panel Édition

*(Visible dans le Dashboard, onglet « Édition de nœud », pas sur la page standalone `/graph-editor`.)*

- **ID du nœud** : Identifiant unique (readonly)
- **Type** : dialogueNode, testNode, endNode
- **Titre** : Libellé optionnel (affichage carte / listes / jump-to ; distinct de l’id stable)
- **Speaker** : Personnage qui parle
- **Dialogue** : Texte de la réplique
- **Test** : Test d'attribut (format: `Attribut+Compétence:DD`)
- **Choix** : Texte, conditions, etc. ; **cibles** (nœud suivant au choix, branches test) via **combobox** branché sur le graphe (pas saisie libre d’id seule)
- **Nœud suivant** : Combobox lorsqu’il n’y a **pas** de choix (flux `nextNode`)
- **Actions** : Enregistrer, Supprimer

### Footer

- **Stats** : Nombre de nœuds et connexions
- **Erreurs** : Clic pour afficher les détails
- **Raccourcis** : Aide-mémoire

## Types de Nœuds

### DialogueNode (Bleu)

- **Usage** : Réplique de PNJ avec ou sans choix
- **Ports** :
  - Entrée (haut) : Reçoit des connexions
  - Sorties (bas) : nextNode (1 port) ou choices (N ports)
- **Édition** : Speaker, Line

### TestNode (Orange)

- **Usage** : Test d'attribut avec branches success/failure
- **Ports** :
  - Entrée (haut) : Reçoit des connexions
  - Sorties (bas) : success (gauche), failure (droite)
- **Édition** : Test (format validé), Line (optionnel)

### EndNode (Gris)

- **Usage** : Fin de dialogue
- **Ports** : Entrée uniquement (pas de sortie)
- **Édition** : Non éditable (node technique)

## Interactions

### Sélection

- **Clic sur nœud** : Sélectionne et affiche dans le panel
- **Clic sur canvas** : Désélectionne

### Connexion

- **Drag depuis port de sortie vers port d'entrée** : Crée une connexion
- **Types de connexions** :
  - `nextNode` : Navigation linéaire
  - `choice` : Choix du joueur (index)
  - `success/failure` : Branches de test

### Déplacement

- **Drag nœud** : Repositionne manuellement
- **Snap to grid** : Alignement automatique (grid 15x15)

### Édition

1. Sélectionner un nœud
2. Modifier les propriétés dans le panel
3. Cliquer "Enregistrer"

### Suppression

1. Sélectionner un nœud
2. Cliquer sur 🗑️ dans le panel
3. Confirmer

## Raccourcis Clavier

| Raccourci | Action |
|-----------|--------|
| `Ctrl+S` | Sauvegarder |
| `Ctrl+Z` | Annuler |
| `Ctrl+Shift+Z` | Refaire |
| `Ctrl+L` | Auto-layout |
| `Ctrl+K` | Valider |
| `Ctrl+4` | Ouvrir l'éditeur |

## Workflow Typique

### 1. Charger un Dialogue Existant

Option A : Depuis UnityDialogueViewer
- Générer un dialogue Unity
- Cliquer "Ouvrir dans l'Éditeur de Graphe"

Option B : Depuis l'URL
- Naviguer vers `/graph-editor`
- Le dialogue sera chargé depuis l'état de navigation

### 2. Visualiser le Graphe

- Le graphe se charge automatiquement
- Utiliser zoom/pan pour naviguer
- La minimap affiche la vue d'ensemble

### 3. Éditer un Nœud

- Cliquer sur un nœud
- Modifier Speaker/Line dans le panel
- Enregistrer

### 4. Organiser le Layout

- Cliquer "Auto-layout" ou `Ctrl+L`
- Les nœuds s'organisent automatiquement
- Ajuster manuellement si besoin

### 5. Valider le Graphe

- Cliquer "Valider" ou `Ctrl+K`
- Les erreurs s'affichent dans le footer
- Cliquer sur les erreurs pour voir les détails

### 6. Sauvegarder

- Cliquer "Sauvegarder" ou `Ctrl+S`
- Le dialogue est converti en Unity JSON
- Le fichier est enregistré avec le titre du dialogue

## Validation

### Types d'Erreurs

- **missing_id** : Nœud sans ID
- **broken_reference** : Connexion vers nœud inexistant
- **empty_node** : Nœud sans contenu (ni line ni choices)
- **missing_test** : TestNode sans test d'attribut

### Types d'Avertissements

- **orphan_node** : Nœud sans connexion entrante
- **unreachable_node** : Nœud inaccessible depuis START
- **cycle_detected** : Cycle dans le graphe (peut être intentionnel)

## Qualité narrative (hors validateur structurel)

Analyses complémentaires (backend `api/routers/graph_quality.py`, client `frontend/src/api/graph.ts`) :

| Besoin | Action UI (toolbar) | API (JWT) | Notes |
|--------|---------------------|-----------|--------|
| Détecter du « context dropping » (références GDD incohérentes avec la sélection de contexte) | Panneau **Context dropping** → détecter | `POST .../graph/detect-context-dropping` | Les options de requête **fusionnent** avec les règles persistées `GET /api/v1/validation/rules/context-dropping` (priorité : corps de requête non nul → fichier → défauts). |
| Règles (profil strict/léger, tolérance, infos obligatoires, overrides par type de dialogue) | **Règles** context-dropping | `GET` / `PUT /api/v1/validation/rules/context-dropping` | Fichier disque : `data/validation-rules/context-dropping.json` (`ContextDroppingRulesService`). |
| Heuristiques « AI slop » (tics de phrasé, répétitions) | Action dédiée dans la barre | `POST .../graph/detect-ai-slop` | Analyse statique ; pas d’appel LLM. |
| Juge qualité dialogue (LLM) | Selon intégration UI | `POST .../graph/evaluate-dialogue-quality` | Nécessite un fournisseur LLM réellement configuré. |

Schémas détaillés : [Backend API Contracts — Graph editor API](../api/api-contracts-api.md#graph-editor-api-apiv1unity-dialoguesgraph).

## Limitations actuelles (MVP)

### Non implémenté ou partiel

- ❌ Édition avancée des choix (conditions, mécaniques RPG) dans l’UI
- ❌ Auto-layout Dagre (avec animation) — le layout serveur reste une stratégie dédiée (`calculate-layout`), pas Dagre animé côté client
- ❌ Validation visuelle systématique (badges, outline sur le canvas)
- ❌ Recherche & filtrage intégrés dans le graphe
- ❌ Export PNG/SVG du canvas

### Workarounds

- **Édition choix** : Modifier le JSON exporté ou les champs disponibles dans le panneau
- **Auto-layout** : Bouton auto-layout / `Ctrl+L` (positionnement calculé côté API)
- **Recherche** : Utiliser Ctrl+F du navigateur ou filtrer dans la liste des dialogues

## Architecture Technique

### Backend

- **Services** :
  - `services/graph_conversion_service.py` : Conversion Unity JSON ↔ ReactFlow, export pour validation schéma
  - `services/graph_validation_service.py` : Validation structurelle, simulation de flux (dead ends, cul-de-sacs, couverture)
  - `services/context_dropping_detector.py` / `services/ai_slop_detector.py` : Analyses qualité « context dropping » et « AI slop »
  - `services/context_dropping_rules_service.py` : Persistance des règles anti-context-dropping (`data/validation-rules/context-dropping.json`)
- **API REST** (JWT obligatoire sur ces routes) :
  - **Graphe** : préfixe `/api/v1/unity-dialogues/graph/` — I/O (`load`, `save`, `save-and-write`), `generate-node`, `estimate-cost`, `validate`, `validate-schema`, `validate-lore-explicit`, `simulate-flow`, `calculate-layout`, `detect-ai-slop`, `detect-context-dropping`, `evaluate-dialogue-quality`, cycle de vie nœuds générés (`prompt`, `nodes/.../accept|reject|regenerate`). Détail et schémas : [Backend API Contracts — Graph editor API](../api/api-contracts-api.md#graph-editor-api-apiv1unity-dialoguesgraph).
  - **Règles context-dropping** : `/api/v1/validation/rules/context-dropping` (GET/PUT) — utilisées par défaut par `detect-context-dropping` quand les options ne les surchargent pas.
- **Client TS** : `frontend/src/api/graph.ts`

### Frontend

- **Store** : `graphStore.ts` (Zustand + temporal pour undo/redo)
- **Components** :
  - `GraphCanvas.tsx` : Canvas ReactFlow
  - `nodes/DialogueNode.tsx` : Nœud de dialogue
  - `nodes/TestNode.tsx` : Nœud de test
  - `nodes/EndNode.tsx` : Nœud de fin
  - `NodeEditorPanel.tsx` : Panel d'édition
- **Page** : `GraphEditorPage.tsx`

## Support

Pour signaler un bug ou demander une feature :
1. Vérifier la section « Limitations actuelles (MVP) »
2. Consulter les logs de validation
3. Exporter le JSON et partager si nécessaire

## Roadmap

### Phase 2 (Futures Features)

1. **Génération IA** : enrichissements UX (file d’attente, prévisualisation) autour du flux existant `generate-node` / accept-reject
2. **Auto-layout Dagre** : Layout avec animation
3. **Validation Visuelle** : Badges et outlines colorés
4. **Recherche** : Barre de recherche avec highlight
5. **Export PNG/SVG** : Export visuel du graphe
6. **Édition Avancée** : React Hook Form + Zod pour tous les champs

### Phase 3 (Polish)

1. **Tests** : Vitest + Playwright
2. **Tooltips** : Sur tous les boutons
3. **Animations** : Transitions fluides
4. **Accessibilité** : Navigation clavier complète
5. **Documentation** : Vidéo démo

## Références

- **ReactFlow** : https://reactflow.dev/
- **Zustand** : https://github.com/pmndrs/zustand
- **Zundo** : https://github.com/charkour/zundo
- **Plan détaillé** : Voir `.cursor/plans/graph_editor_visual_*.plan.md`
