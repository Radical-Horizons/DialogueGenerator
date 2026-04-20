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
- **Exporter Unity** : Export vers Unity (futur)

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

### Qualité narrative (toolbar)

Depuis l’en-tête du graphe (dashboard) :

- **Détection AI slop (FR43)** : motifs répétitifs / génériques sur les textes des nœuds ; appelle `POST /api/v1/unity-dialogues/graph/detect-ai-slop` (`api/routers/graph_quality.py`, client `frontend/src/api/graph.ts`).
- **Context dropping (FR44 + FR45)** : panneau dédié ; détection via `POST /api/v1/unity-dialogues/graph/detect-context-dropping`. Les **règles persistées** (profil strict/léger, tolérance, infos obligatoires, surcharges par type de dialogue) se configurent dans le même panneau et passent par **`GET` / `PUT` `/api/v1/validation/rules/context-dropping`** (`ContextDroppingRulesEditor`, fichier `data/validation-rules/context-dropping.json`). Les champs fournis dans le **body** de détection priment sur le fichier pour ce run.

JWT requis pour ces routes (même session que le reste de l’API graphe).

### Types d'Erreurs

- **missing_id** : Nœud sans ID
- **broken_reference** : Connexion vers nœud inexistant
- **empty_node** : Nœud sans contenu (ni line ni choices)
- **missing_test** : TestNode sans test d'attribut

### Types d'Avertissements

- **orphan_node** : Nœud sans connexion entrante
- **unreachable_node** : Nœud inaccessible depuis START
- **cycle_detected** : Cycle dans le graphe (peut être intentionnel)

## Limitations Actuelles (MVP)

### Non implémenté / obsolète dans ce guide

- ❌ Édition avancée des choix (conditions, mécaniques RPG)
- ❌ Auto-layout Dagre (avec animation)
- ❌ Validation visuelle (badges, outline)
- ❌ Recherche & filtrage
- ❌ Export PNG/SVG

### Workarounds

- **Génération IA** : génération de nœuds depuis le graphe via `POST /api/v1/unity-dialogues/graph/generate-node` (`graph_generation.py`) ; ce guide utilisateur ne détaille pas le flux (voir code / tests API).
- **Édition choix** : Modifier le JSON exporté manuellement
- **Auto-layout** : Layout basique en cascade (non Dagre)
- **Recherche** : Utiliser Ctrl+F du navigateur dans le JSON exporté

## Architecture Technique

### Backend

- **Services** :
  - `graph_conversion_service.py` : Conversion Unity JSON ↔ ReactFlow
  - `graph_validation_service.py` : Validation de graphe
- **API** : `/api/v1/unity-dialogues/graph/*` (routers `graph_io`, `graph_generation`, `graph_cost`, `graph_validation`, `graph_quality`, `graph_flow`, `graph_node_history` — voir `api/main.py`)
  - Exemples : `POST /load`, `POST /save`, `POST /validate`, `POST /generate-node`, `POST /detect-ai-slop`, `POST /detect-context-dropping`, layout / flux selon modules
- **Règles context-dropping persistées** : `GET`/`PUT` `/api/v1/validation/rules/context-dropping` (`validation_rules.py`)

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
1. Vérifier la section "Limitations Actuelles"
2. Consulter les logs de validation
3. Exporter le JSON et partager si nécessaire

## Roadmap

### Phase 2 (Futures Features)

1. **AI Generation Panel** : Générer des nœuds en contexte
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
