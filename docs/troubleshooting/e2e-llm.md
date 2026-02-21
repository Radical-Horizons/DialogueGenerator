# E2E avec appels LLM

Tests end-to-end Playwright qui déclenchent des générations LLM (ex. `graph-node-accept-reject`) ou valident le preflight (ex. `e2e-llm-preflight`).  
Objectif : faire passer ces tests lorsque l'environnement est correctement configuré, et échouer tôt avec des messages clairs sinon.

## Prérequis

- **`.env`** à la racine du projet avec `OPENAI_API_KEY`, ou variable d'environnement équivalente (ex. Windows).
- **Budget** utilisable : quota > 0 et non saturé. Le preflight peut ajuster automatiquement le quota en E2E (voir ci‑dessous).

## Lancer les serveurs avant les tests (recommandé)

Playwright peut démarrer API et frontend via `webServer`, mais il les arrête à la fin du run. Si un test échoue (ex. timeout), les retries ou tests suivants peuvent voir **ECONNREFUSED** car le serveur n’est plus là. **En tant que dev, tu dois t’assurer que l’environnement répond avant de considérer les E2E terminés.**

**Procédure recommandée :**

1. **Terminal 1** : `npm run dev` (API 4243 + frontend 3000).
2. **Terminal 2** : `npm run test:e2e:llm`.

Ainsi Playwright réutilise les serveurs (`reuseExistingServer: true` hors CI) et ne les tue pas ; les retries et tests suivants ont l’API disponible.

## Commande

```bash
npm run test:e2e -- e2e/graph-node-accept-reject.spec.ts
```

Script dédié (tous les specs `@e2e-llm`) :

```bash
npm run test:e2e:llm
```

Preflight seul (sans appel LLM, rapide) :

```bash
npm run test:e2e:llm:preflight
```

Les specs concernés sont tagués `@e2e-llm` : `graph-node-accept-reject`, `e2e-llm-preflight`.  
Pour exclure ces tests en CI (sans `OPENAI_API_KEY`) :  
`playwright test --grep-invert @e2e-llm`.

## Specs

| Spec | Rôle |
|------|------|
| `e2e/e2e-llm-preflight.spec.ts` | Preflight isolé : health, budget GET, auto-ajustement quota (quota 0 → 50), fail-fast sur mauvais port. Aucun appel LLM. |
| `e2e/graph-node-accept-reject.spec.ts` | Accept/Reject de nœuds générés (LLM). Prérequis : preflight vert, gpt-5-nano, dialogue « Tunnel vertébral ». |

## Preflight

Avant les tests du spec, un `beforeAll` :

1. **Clé API** : `GET /health/detailed` → check `llm_connectivity`. Si `status !== 'healthy'`, échec avec :
   > E2E LLM : OPENAI_API_KEY manquante. Définir .env à la racine ou la variable d'environnement. Voir docs/troubleshooting/e2e-llm.md.

2. **Budget** : `GET /api/v1/costs/budget`. Si `quota <= 0` ou `percentage >= 100` → `PUT /api/v1/costs/budget` avec `{ quota: 50 }`.  
   Si GET ou PUT échoue → échec avec un message pointant vers ce doc.

L'API doit tourner sur le **port 4243** (aligné avec le proxy Vite en E2E). Playwright configure `API_PORT=4243` et `HEALTH_CHECK_LLM_PING=true` pour le webServer API.

## Modèle

Les E2E utilisent **gpt-5-nano** pour limiter les coûts. Le panneau de génération sélectionne ce modèle via `data-testid="llm-model-select"`.  
`gpt-5-nano` est défini dans `app_config.json` (`available_models`).

## Comportement des tests

- **Dialogue fixe** : « Tunnel vertébral » (sans TestNodes) pour stabiliser le flow.
- **Liste** : attente de `unity-dialogue-list` visible (60s) au lieu de « Chargement… ».
- **AC#3** : Rejeter scopé au nœud pending ; attente 0 pending avant de compter.
- **AC#5** : même dialogue avant/après reload, toast « Brouillon local restauré » requis, 10s avant reload pour le debounce draft.

## Dépannage

| Problème | Vérifications |
|----------|---------------|
| Clé API manquante | `.env` à la racine avec `OPENAI_API_KEY`, ou variable d'environnement. Redémarrer l'API (ou relancer les E2E). |
| Budget bloqué | `data/cost_budgets.json` : `quota > 0`, `percentage < 100`. Le preflight peut forcer `quota: 50` si besoin. |
| API injoignable / ECONNREFUSED | **Lance le serveur avant les tests** : `npm run dev`, puis dans un autre terminal `npm run test:e2e:llm`. L’API doit écouter sur **4243**. Si Playwright a démarré les serveurs et qu’un test a échoué, les retries n’ont plus d’API → relancer les tests avec le serveur déjà up. |
| Aucun toast de succès | Vérifier les logs frontend/API, budget, modèle gpt-5-nano. S'assurer qu'un dialogue Unity existe (ex. `Assets/Dialogue/*.json`) et que le graphe charge correctement. |
| AC#5 pending introuvable après reload | Draft : debounce 3s, attendre 10s avant reload. Même dialogue « Tunnel vertébral » avant/après. |

## Références

- `e2e/e2e-llm-preflight.spec.ts` : preflight isolé (health, budget, auto-ajustement, fail-fast port).
- `e2e/graph-node-accept-reject.spec.ts` : accept/reject avec LLM.
- `.cursor/rules/workflow.mdc` : commandes, E2E, venv.
- `.cursor/rules/frontend_testing.mdc` : tests frontend, E2E, LLM.
- `README_API.md` : API REST.
- `docs/troubleshooting/post-mortem-e2e-llm.md` : post-mortem des tests E2E LLM (causes, correctifs, leçons).
