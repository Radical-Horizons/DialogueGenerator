# DialogueGenerator - Outil de Génération de Dialogues IA

Ce projet vise à créer une application autonome pour assister à la création de dialogues pour jeux de rôle, en s'interfaçant avec des modèles de langage (LLM) et en s'appuyant sur un Game Design Document (GDD) existant.

## 🚀 Démarrage rapide

```bash
npm install          # Première fois seulement
npm run dev          # Lance backend + frontend automatiquement
```

**L'app sera accessible sur http://localhost:3000**

L'application utilise **l'interface web** (React + FastAPI) comme interface principale.

### Production (OVH)

L’instance de référence est sur un **VPS OVH** (Ubuntu) ; déploiement typique : `npm run deploy`. Détails (IP, SSH, Nginx, URL publique **`demo.auto-diffusion.net`**) : **[`docs/deployment/PRODUCTION.md`](docs/deployment/PRODUCTION.md)**. Guide générique : [`docs/guides/deployment-guide.md`](docs/guides/deployment-guide.md).

## Objectif Principal (Rappel des Spécifications)

1.  Charger le GDD (via des fichiers JSON extraits de Notion).
2.  Permettre à l'utilisateur de sélectionner un contexte (personnages, lieux, etc.).
3.  Générer des nœuds de dialogue au format JSON Unity en utilisant un LLM.
4.  Faciliter l'écriture, l'évaluation et la validation de ces dialogues.
5.  S'intégrer avec une pipeline de production de jeu (export JSON Unity, commit Git).

## État actuel du projet (juin 2026)

Comportement livré — en cas d'écart avec un document, le **code et les tests** font foi.

*   **Interface web (React + FastAPI)** :
    *   Génération de dialogues LLM avec contexte GDD, variantes, export Unity JSON.
    *   **Éditeur de graphe** (React Flow) : édition visuelle, validation, autosave, export.
    *   **UI responsive + PWA** (Epic 17) : drawers tablette/mobile, toolbar graphe adaptative.
*   **API documents** (`/api/v1/documents/*`) :
    *   Persistance dialogue canonique + layout sidecar, contrôle de révision.
    *   Preview scénario (flags, réputation, **stats FR94** : attributs, Effort, skill checks).
    *   Validation références flags (FR93) et diagnostics sociaux (Influence/Respect vs Réputation).
*   **Epic 9 — Variables & systèmes de jeu** :
    *   Flags catalogue, conditions de visibilité, effets de choix.
    *   **FR94** : panneau « Systèmes de jeu », réputation v3, tests de compétence tentables, coûts Effort.
*   **GDD & contexte** :
    *   `ContextBuilder` charge `data/GDD_categories/` et `Vision.json`.
    *   Sync Notion optionnelle — voir `docs/guides/GDD_NOTION_SYNC.md`.
*   **LLM** :
    *   `OpenAIClient` (défaut `gpt-5-mini`) ou `DummyLLMClient` sans clé API.

## 📚 Documentation

### Documentation technique

- **Référence durable** : [`docs/`](docs/) avec index [`docs/index.md`](docs/index.md) — contrats API, guides, architecture. Maintenue pour refléter le code.
- **API opérationnelle** : [`README_API.md`](README_API.md)
- **Agents Cursor** : [`AGENTS.md`](AGENTS.md)

**Source de vérité comportementale** : code (`api/`, `services/`, `frontend/`) + tests (`tests/`, Vitest). En cas d'écart doc ↔ code, le code prime.

**Contexte planification optionnel** : [`_bmad-output/`](_bmad-output/) (épics, stories, ADRs) — historique décisionnel, pas autorité sur l'implémentation livrée.

### Documentation structurée

La documentation organisée se trouve dans [`docs/`](docs/) avec un index dans [`docs/index.md`](docs/index.md).

## Structure du Projet

Le code est organisé dans le dossier `DialogueGenerator/` avec les principaux modules suivants :

*   `api/`: API REST FastAPI (backend).
    *   `routers/`: Routes API pour dialogues, contexte, configuration, etc.
    *   `schemas/`: Schémas Pydantic pour validation des requêtes/réponses.
    *   `services/`: Services API (authentification, etc.).
    *   `container.py`: ServiceContainer pour la gestion du cycle de vie des services.
    *   `dependencies.py`: Helpers d'injection de dépendances FastAPI.
*   `frontend/`: Interface web React (frontend).
    *   `src/`: Code source React/TypeScript.
*   `config/`: Contient les fichiers de configuration (ex: `llm_config.json`, `context_config.json`, `app_config.json`).
*   `core/`: Modules métier principaux (logique métier indépendante de l'interface).
    *   `context/`: Construction et gestion du contexte GDD (`context_builder.py`).
    *   `prompt/`: Construction et gestion des prompts LLM (`prompt_engine.py`).
    *   `llm/`: Clients et interfaces pour les modèles de langage (`llm_client.py`).
*   `data/`: Données persistantes de l'application.
    *   `interactions/`: Stockage des dialogues générés (fichiers JSON).
*   `models/`: Structures de données Pydantic utilisées dans l'application.
    *   `dialogue_structure/`: Modèles pour les éléments de dialogue et les interactions.
*   `services/`: Services applicatifs réutilisables (ex: gestion des interactions, rendu JSON Unity, configuration).
    *   `repositories/`: Abstractions pour l'accès aux données (ex: `FileLLMUsageRepository`).
    *   `json_renderer/`: Logique pour convertir les interactions en format JSON Unity.
    *   `configuration_service.py`: Gestionnaire principal de configuration (fichiers JSON).
*   `tests/`: Tests unitaires et d'intégration.
    *   `manual/`: Scripts de test manuels et de debug.

### Architecture

#### Injection de Dépendances

L'application utilise `api/container.py` (ServiceContainer) pour gérer le cycle de vie des services.
Le container est initialisé dans `app.state` au démarrage de l'API (voir `api/main.py`).
Toutes les dépendances FastAPI utilisent `api/dependencies.py` qui accède au container via `request.app.state.container`.

**Note**: Les modules `context_builder.py`, `prompt_engine.py`, et `llm_client.py` à la racine sont des wrappers de compatibilité qui redirigent vers `core/`. Ils seront supprimés dans la version 2.0.

## Prérequis et Installation

1.  **Python** : Version 3.10 ou ultérieure recommandée.
2.  **Node.js et npm** : Pour l'interface web et les scripts de développement.
3.  **Environnement virtuel Python** : Le projet utilise un venv pour isoler les dépendances.

### Installation Rapide

**Méthode recommandée (automatique):**

```bash
# Créer le venv et installer toutes les dépendances
npm run setup
```

**Méthode manuelle:**

```bash
# 1. Créer l'environnement virtuel Python
python -m venv .venv

# 2. Activer le venv (Windows PowerShell)
.\.venv\Scripts\Activate.ps1

# 3. Installer les dépendances Python
pip install -r requirements.txt

# 4. Installer les dépendances frontend
cd frontend
npm install
cd ..
```

**Note:** Tous les scripts npm (`npm run dev`, `npm test`, etc.) utilisent automatiquement le venv. Vous n'avez besoin de l'activer manuellement que si vous exécutez des commandes Python directement.

4.  **Configuration des variables d'environnement** :
    *   Copier `.env.example` vers `.env` :
        ```bash
        cp .env.example .env
        ```
    *   Modifier `.env` et définir les variables nécessaires :
        *   `OPENAI_API_KEY` : Clé API OpenAI (requis pour la génération de dialogues)
        *   `JWT_SECRET_KEY` : Clé secrète pour JWT (valeur par défaut acceptée en dev, **doit être changée en production**)
        *   `ENVIRONMENT` : Environnement (`development` ou `production`)
    *   Pour plus de détails, voir [README_API.md](README_API.md) et [docs/SECURITY.md](docs/SECURITY.md).

### Vérifier l'Installation

```bash
npm run verify:venv
```

Ce script vérifie que le venv et toutes les dépendances sont correctement installés.

## Comment Lancer l'Application

1.  **Positionnement des Données du GDD** :
    *   Les fichiers JSON du Game Design Document (GDD) doivent être accessibles via un lien symbolique.
    *   **Fichiers de catégories** : L'application utilise le chemin `DialogueGenerator/data/GDD_categories/` qui doit être un lien symbolique pointant vers le répertoire réel contenant les fichiers JSON (personnages.json, lieux.json, etc.).
    *   **Vision.json** : Depuis `DialogueGenerator/data/Vision.json` (dans le même dossier que GDD_categories).
    *   Exemple de structure attendue :
        ```
        DialogueGenerator/  <-- Racine du projet de l'application
        ├── data/
        │   ├── GDD_categories/  <-- Dossier réel (maintenance manuelle)
        │   │   ├── personnages.json
        │   │   ├── lieux.json
        │   │   └── ... (autres fichiers JSON du GDD)
        │   └── Vision.json  <-- Fichier Vision.json
        ├── api/
        ├── core/
        └── ... (autres fichiers et dossiers du projet)
        ```
    *   **Note** : Les fichiers GDD doivent être copiés manuellement dans `data/GDD_categories/` et `Vision.json` dans `data/`.

2.  **Lancement** :
    *   **Interface Web** :
        ```bash
        npm run dev
        ```
        L'application sera accessible sur http://localhost:3000

## Prochaines Étapes Prévues

*   **Amélioration de la Sélection/Construction du Contexte** :
    *   Permettre la sélection explicite de plusieurs personnages (Acteur A, Acteur B).
    *   Enrichir le résumé de contexte avec plus de détails pertinents des éléments sélectionnés.
*   **Implémentation d'un Client LLM Réel (`OpenAIClient`)** :
    *   Gérer la configuration de la clé API (probablement via `config.yaml` ou variable d'environnement).
    *   Permettre de switcher entre `DummyLLMClient` et `OpenAIClient`.
*   **Gestion Asynchrone Améliorée** :
    *   Optimisation des appels LLM asynchrones pour améliorer la réactivité de l'interface web.
*   **Amélioration du `PromptEngine` et du *System Prompt*** :
    *   Itérer sur le *system prompt* basé sur les résultats réels.
    *   Instructions plus détaillées pour le format JSON Unity.
*   **Interface pour plus de `generation_params`** (ton, style, température, sélection de modèle).
*   **Sorties Structurées (Structured Outputs)** : Explorer l'utilisation de JSON Schema avec l'API OpenAI pour un output plus fiable.
*   **`UnityJsonRenderer`** : Module pour convertir les Interactions en fichiers JSON Unity (tableau de nœuds normalisé).
*   **`GitService`** : Pour l'intégration Git.
*   **Stratégie Avancée de Génération de Variantes : Les "Événements Notables"**
    *   Pour améliorer la réactivité des dialogues et gérer la multiplicité des états du monde d'un RPG, une stratégie avancée est envisagée pour la construction du contexte et la génération de variantes.
    *   **Concept Principal :**
        *   Au lieu de se baser uniquement sur des variables simples, cette approche introduit la notion d'"**Événements Notables**".
        *   Chaque événement ou point de divergence narratif clé est identifié (ex: `decision_guilde_voleurs`, `issue_bataille_fort_dragon`).
        *   Chaque événement peut avoir plusieurs **états distincts** (ex: pour `decision_guilde_voleurs` : état 0 = non survenu, état 1 = joueur trahit la guilde, état 2 = joueur reste loyal).
    *   **Structure d'un État d'Événement :**
        *   **Valeur pour le Code :** Un identifiant simple (entier, chaîne courte) utilisé dans la logique du jeu.
        *   **Description Textuelle pour le LLM :** Une description narrative détaillée de l'état et de ses implications. Cette description fournit un contexte riche au LLM.
            *   Exemple pour `decision_guilde_voleurs` état 1 : *"Lors d'un assaut dramatique de la garde royale sur le repaire de la guilde des voleurs, le joueur, bien que membre de la guilde, a choisi de coopérer avec la garde, livrant des informations cruciales en échange d'une promesse de clémence."*
    *   **Processus de Génération de Dialogue :**
        *   **Sélection dans l'Interface :**
            *   Dans `DialogueGenerator`, l'utilisateur sélectionne le dialogue de base à continuer.
            *   L'utilisateur active ensuite un ou plusieurs "Événements Notables" pertinents pour cette interaction.
            *   Pour chaque événement activé, tous ses états possibles (ou un sous-ensemble choisi par l'utilisateur) sont considérés.
        *   **Génération de Variantes Multiples :**
            *   Le système génère automatiquement une variante de dialogue pour **chaque combinaison possible** des états des événements sélectionnés.
            *   Si un seul événement `E_A` avec 3 états (A0, A1, A2) est activé, 3 variantes de dialogue sont générées.
            *   Si deux événements, `E_A` (3 états) et `E_B` (2 états), sont activés, 3 * 2 = 6 variantes sont générées.
        *   **Appels au LLM :**
            *   Chaque variante de dialogue nécessite un **appel séparé au LLM**, car le contexte textuel fourni est unique.
    *   **Avantages :**
        *   Contexte sémantique riche pour le LLM.
        *   Automatisation des branches narratives.
        *   Contrôle fin par le designer.
        *   Intégration avec le format JSON Unity.
    *   **Défis et Considérations :**
        *   Explosion combinatoire des variantes.
        *   Cohérence des descriptions combinées.
        *   Gestion des dépendances entre événements.
        *   Adaptation de l'interface utilisateur de `DialogueGenerator`.
    *   Cette approche représente une évolution significative pour la génération de dialogues dynamiques et contextuellement conscients.

## Warnings connus (non bloquants)

### Warning Node.js `util._extend` déprécié

Lors du démarrage avec `npm run dev`, vous pouvez voir un warning Node.js :
```
(node:xxxxx) [DEP0060] DeprecationWarning: The `util._extend` API is deprecated. Please use Object.assign() instead.
```

**Ce warning est normal et non bloquant.** Il provient de la dépendance `concurrently` (via `spawn-command`) qui utilise une API Node.js dépréciée. Cela n'affecte pas le fonctionnement de l'application. Ce warning sera résolu lorsque les dépendances seront mises à jour.

### Warnings de validation GDD

Au démarrage, vous pouvez voir des warnings concernant la validation des champs GDD :
- Champs invalides détectés (normal si certains champs ne sont pas dans la configuration)
- Fichiers GDD manquants (normal si certains fichiers sont optionnels)

Ces warnings sont informatifs et n'empêchent pas l'application de fonctionner. Pour plus de détails, utilisez `STARTUP_REPORT=full npm run dev`.

## Maintenance des Données GDD

⚠️ **Important** : Les dossiers `data/GDD_categories/` et `data/UnityData/` ne sont **plus des liens symboliques** mais des dossiers réels. Ils doivent être **maintenus manuellement**.

Pour plus de détails sur la mise à jour des données GDD, consultez : [`docs/deployment/DATA_MAINTENANCE.md`](docs/deployment/DATA_MAINTENANCE.md)

## Dépannage

### Erreur Git "fatal: bad object refs/heads/desktop.ini" (Windows)

**Symptôme** : Git affiche des erreurs comme `fatal: bad object refs/heads/desktop.ini` ou `fatal: bad object refs/desktop.ini`.

**Cause** : Windows crée automatiquement des fichiers `desktop.ini` dans les dossiers pour la personnalisation de l'affichage. Si ces fichiers sont créés dans `.git/refs/`, Git les traite comme des références invalides.

**Solution** : Exécuter le script de nettoyage :
```powershell
powershell -ExecutionPolicy Bypass -File scripts/cleanup_desktop_ini.ps1
```

Ce script déplace tous les fichiers `desktop.ini` de `.git/` vers `.git/_desktop_ini_quarantine/` sans les supprimer. Vous pouvez supprimer le dossier de quarantaine une fois que Git fonctionne correctement.

**Prévention** : Le `.gitignore` ignore déjà `desktop.ini`, mais cela n'empêche pas Windows d'en créer dans `.git/`. Si le problème réapparaît, réexécutez le script de nettoyage.

---
*Ce document sera mis à jour au fur et à mesure de l'avancement du projet.* 