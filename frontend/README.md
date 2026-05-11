# DialogueGenerator Frontend

Application React TypeScript pour l'interface web de DialogueGenerator.

✅ **Interface principale du projet** — Utiliser cette interface pour le développement et la production.

## Installation

```bash
npm install
```

## Développement

**Plein stack (recommandé)** : depuis la **racine du dépôt**, `npm run dev` (backend 4243 + Vite 3000).

**Frontend seul** (`cd frontend && npm run dev`) : Vite seul sur le port 3000 ; le proxy `/api` attend toujours une API sur **4243** — lancez le backend séparément (`npm run dev -- --backend` à la racine, ou `API_PORT=4243` + `python -m api.main`).

```bash
npm run dev
```

L'application sera accessible sur http://localhost:3000

## Build de production

```bash
npm run build
```

Les fichiers de production seront dans le dossier `dist/`.

## Configuration

En développement avec `npm run dev` à la **racine du dépôt**, le proxy Vite (`frontend/vite.config.ts`) envoie `/api` vers `http://localhost:4243`. **Recommandé** : ne pas définir `VITE_API_BASE_URL` (URLs relatives `/api`).

Pour un build ou un outil qui doit appeler l’API par URL absolue en local, utilisez le port **dev** aligné sur les scripts :

```
# Exemple uniquement si vous avez besoin d’une base absolue (sinon laisser vide)
VITE_API_BASE_URL=http://localhost:4243
```

**Note** : `python -m api.main` sans variable d’environnement écoute sur **4242** par défaut (`api/main.py`) ; le stack `npm run dev` force **4243** pour correspondre au proxy. La production derrière Nginx utilise en général **4242** (voir `docs/deployment/PRODUCTION.md`).

## Structure

- `src/api/` - Client API et endpoints
- `src/components/` - Composants React
- `src/store/` - State management (Zustand)
- `src/types/` - Types TypeScript
- `src/hooks/` - React hooks personnalisés

