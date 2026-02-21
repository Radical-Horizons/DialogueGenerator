# Post-mortem : E2E graph-node-accept-reject (LLM)

Tests E2E qui appellent le LLM (accept/reject de nœuds générés). Résolution anormalement longue malgré une application fonctionnelle en manuel.

---

## 1. Résumé

| Élément | Détail |
|--------|--------|
| **Périmètre** | `e2e/graph-node-accept-reject.spec.ts` (AC#1, AC#2, AC#3, AC#5) |
| **Symptôme principal** | Tests skippés ou échoués alors que l'appli et la génération LLM marchent en manuel |
| **Impact** | Blocage récurrent des validations Story 1.4, sentiment que « les E2E LLM ne marchent pas » |
| **Durée** | Plusieurs itérations (plan → implémentation → debug → stabilisation) |

---

## 2. Symptômes et impact

- **Skip initial** : message du type « Les 4 tests sont skippés tant que la génération LLM n'ajoute pas de nœud (pas de clés API / config) » alors que `OPENAI_API_KEY` est bien dans `.env` et en variables d'environnement.
- **Timeout / pas de toast** : attente du toast « Nœud généré avec succès » qui n'arrive jamais (timeout 90s puis 360s).
- **Échecs incohérents** : un test passe isolément mais échoue en suite (ex. AC#2, AC#3).
- **Assertions étranges** : `Expected: 4, Received: 1` sur le nombre de nœuds après reject — suggère qu'on supprime 4 nœuds au lieu d'un seul.
- **AC#5** : « Brouillon local restauré » vu mais nœud pending introuvable après reload.

**Impact** : perte de confiance dans les E2E, tentation de laisser les tests en skip ou de ne pas les lancer.

---

## 3. Causes racines

### 3.1 Port API ≠ proxy frontend

- Playwright démarrait l'API sur **4242** (ou défaut), le proxy Vite pointait vers **4243**.
- En E2E, le front appelle `/api/...` → proxy → **4243**. Si l'API n'écoute que sur 4242, tous les appels (health, budget, génération) échouent.
- **Conséquence** : pas de toast succès, `getBudget()` en erreur → `useCostGovernance` bloque la génération.

### 3.2 Budget et preflight

- `cost_budgets.json` avec `quota: 0` ou `percentage >= 100` (ex. `amount` > `quota`) → validation `BudgetResponse` (e.g. `percentage <= 100`) échouait, 500 sur GET budget.
- Aucun contrôle **avant** les tests : on découvrait l'échec au moment du toast manquant, avec un message générique.

### 3.3 Sélection du dialogue (régression flaky)

- Les tests ciblent « Tunnel vertébral » (1 nœud START, pas de TestNodes). Le sélecteur utilisait un **regex sur le titre** (`/Tunnel vertébral/i`).
- Selon l'ordre du DOM, le **premier** match pouvait être un **autre** dialogue (ex. avec 3 choices → 3 TestNodes). On chargeait donc un graphe à 4 nœuds au lieu de 1.
- En suite, après sauvegarde (AC#2), ordre/modification des fichiers pouvait changer le « premier » match.
- **Conséquence** : AC#3 compte 5 nœuds, rejette 1, en attend 4. Mais le bouton Reject était peut‑être mal scopé → suppression d'un nœud « critique » (ex. START) et de ses TestNodes → 1 nœud restant, d'où `Expected: 4, Received: 1`.

### 3.4 Reject scopé au mauvais nœud

- `page.locator('button:has-text("Rejeter")').first()` pouvait cliquer un Reject **en dehors** du nœud pending ciblé (ex. chevauchement, z-index, ordre DOM).
- D'où suppression du mauvais nœud et comptes incohérents.

### 3.5 Draft et AC#5

- Brouillon sauvegardé en `localStorage` avec **debounce** (ex. 3s). Reload **trop tôt** → pas encore persisté.
- Ou lien dialogue **avant / après** reload pas garanti (même liste, même ordre) → on ne rouvre pas exactement le même dialogue.

### 3.6 Logging et Unicode (Windows)

- `logger.info` avec caractères Unicode (→, \u2011, etc.) dans des réponses API ou du contenu LLM.
- Sous Windows, console en `cp1252` → `UnicodeEncodeError` lors de l'écriture des logs. N'arrête pas les tests mais pollue les traces et peut masquer d'autres erreurs.

### 3.7 Manque de structure autour des E2E LLM

- Pas de doc dédiée ni de prérequis clairs (clé, budget, port, modèle).
- Pas de preflight → échecs tardifs et messages peu actionnables.
- Skips par défaut plutôt qu'« échouer tôt avec des instructions précises ».

---

## 4. Chronologie des correctifs

1. **Plan E2E LLM** : port 4243, preflight (clé + budget), gpt-5-nano, suppression des skips, `docs/troubleshooting/e2e-llm.md`, script `test:e2e:llm`, tag `@e2e-llm`.
2. **Port** : `playwright.config` → `API_PORT=4243`, health sur 4243 ; `cost-governance` et `graph-cycle-validation` alignés sur 4243.
3. **Preflight** : `beforeAll` → GET `/health/detailed` (llm_connectivity), GET/PUT budget ; échec explicite sinon.
4. **Modèle** : `data-testid="llm-model-select"`, `selectOption('gpt-5-nano')` dans le helper de génération.
5. **Skips** : remplacés par `expect` qui échouent, avec messages pointant vers `docs/troubleshooting/e2e-llm.md`.
6. **Stabilisation** :
   - Sélection du dialogue **par filename** (`tunnel_vertébral_pigments_impossibles.json`) au lieu du titre pour « Tunnel vertébral ».
   - Reject **scopé** au nœud pending : `pendingNode.locator('button:has-text("Rejeter")')`.
   - Attente « 0 pending » avant de compter les nœuds après reject.
   - AC#5 : même dialogue (filename), attente **10s** avant reload (debounce draft), assertion explicite sur le toast « Brouillon local restauré ».
7. **Robustesse** : `test.setTimeout(360_000)`, `retries: 1`, pause **5s** en `afterEach`, timeout toast 360s.
8. **Logging** : remplacement de `→` par `->` (et caractères proches) dans `response_parser` et `mistral_client` pour éviter `UnicodeEncodeError` sous Windows.
9. **Budget** : cap de `percentage` à 100 côté backend pour éviter 500 quand `amount` > `quota`.

---

## 5. Leçons apprises

- **Environnement E2E ≠ dev manuel** : ports, variables, workers, ordre des tests, état disque (fichiers modifiés par les tests) peuvent diverger. Les E2E doivent **expliciter** et **vérifier** ces prérequis (preflight).
- **Sélecteurs E2E** : privilégier des identifiants **stables et univoques** (filename, `data-testid`) plutôt que du texte ou des regex sur des labels partagés. Sinon, ordre du DOM ou contenu changeant → flakiness.
- **Scoper les actions** : pour des actions sur un élément précis (ex. Reject d'un nœud), restreindre les locators au sous-arbre de cet élément pour éviter de cliquer ailleurs.
- **Timing** : debounce, sauvegardes, reload — bien documenter les délais nécessaires et les attentes explicites (toast, comptes, visibilité) avant d'asserter.
- **Fail fast** : preflight + messages d'échec clairs (clé, budget, port) réduisent le temps perdu à chercher « pourquoi ça ne marche pas » en plein milieu d'un test.
- **Coût des E2E LLM** : utiliser un modèle cheap (gpt-5-nano), timeouts réalistes, retries limités. Documenter tout ça pour que l'équipe comprenne quoi attendre.

---

## 6. Recommandations

| Priorité | Action |
|----------|--------|
| Haute | Garder **preflight** (clé + budget) et **doc** `docs/troubleshooting/e2e-llm.md` à jour dès qu'on ajoute un prérequis ou un spec E2E LLM. |
| Haute | Pour tout nouveau spec E2E touchant une liste (dialogues, etc.) : utiliser **filename** ou **data-testid** plutôt qu'un regex sur titre/libellé si l'ordre ou le contenu peut varier. |
| Moyenne | Éviter **Unicode** dans les messages de log (ou forcer UTF-8 / replace par ASCII) pour éviter `UnicodeEncodeError` sous Windows. |
| Moyenne | En CI : exclure les specs `@e2e-llm` si `OPENAI_API_KEY` absent ; documenter la commande et les coûts approximatifs. |
| Basse | Réduire la **pause afterEach** (ex. 5s → 2s) une fois la flakiness résorbée, si la suite reste verte. |

---

## 7. Références

- `docs/troubleshooting/e2e-llm.md` : prérequis, commandes, preflight, dépannage.
- `e2e/graph-node-accept-reject.spec.ts` : implémentation actuelle (preflight, helpers, AC#1–5).
- `.cursor/rules/frontend_testing.mdc`, `workflow.mdc` : E2E, LLM, workflow de test.
