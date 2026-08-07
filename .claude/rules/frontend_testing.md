---
description: Tests Frontend — Vitest, React Testing Library, Playwright, workflow de test automatique, tout bug ou problème lié à l'interface, aux boutons, aux écrans, aux formulaires, etc.
paths:
  - "frontend/**/*.test.{ts,tsx}"
  - "frontend/src/test/**"
  - "e2e/**/*.ts"
  - "playwright.config.ts"
  - "frontend/vitest.config.ts"
---
- Tu es autonome pour les tests frontend via l'outil browser. Tu peux te connecter avec le login admin et le mot de passe admin123.
- **Tests unitaires**: Vitest + React Testing Library dans `frontend/src/test/` et `frontend/src/**/*.test.ts`. Tests rapides, isolation complète, mocks pour API. Tests de parsing dans `frontend/src/hooks/usePromptPreview.test.ts`.
- **`npm test` dans `frontend/`** = **`vitest run` rapide** (exclut 3 fichiers d’intégration lourds ; liste dans `frontend/vitest.config.ts`). **`npm run test:full`** = suite complète (comme la CI). Le watch = **`npm run test:watch`** (ne se termine pas).
- **Exécution depuis un agent Cursor** : grille T0–T3 → **`.claude/commands/test-tiers.md`** ; politique Vitest (filtres, interdits, PowerShell) → **`.claude/rules/workflow.md`**. Ici : patterns de tests, pas la procédure d’orchestration.
- **Tests E2E**: Playwright dans `e2e/`. Tests critiques (auth, navigation, génération), nécessite serveurs lancés. L'environnement E2E est complet (clé API, budget, GDD, etc.) ; tous les tests E2E sont censés passer. Pour l'éditeur de graphe : scoper la liste dans le contexte actif : `page.getByTestId('graph-editor').getByTestId('unity-dialogue-list')` quand le test travaille sur l'onglet Éditeur de Graphe. Specs avec LLM : voir `docs/troubleshooting/e2e-llm.md` pour preflight et dépannage. Post-mortem : `docs/troubleshooting/post-mortem-e2e-llm.md`.
- **Formulaires (react-hook-form) + Playwright** : `page.fill()` met à jour le DOM mais RHF peut ne pas mettre à jour son store interne (il écoute le `change` natif). Pour vérifier la persistance après save : soit blur explicite (Tab ou clic canvas) avant de déclencher la sauvegarde, soit asserter via API (GET du fichier sauvegardé) plutôt que via reload de la page.
- **Seed E2E (PUT document)** : en cas de 409 (optimistic locking), réessayer le PUT avec la `revision` renvoyée dans le corps de la réponse jusqu'à succès. Convention utilisée dans `e2e/documents-layout-adr008.spec.ts`.
- **Vérifications automatiques après modification frontend**:
  1. Build check : `cd frontend && npm run build` (détecte erreurs TypeScript)
  2. Lint check : `cd frontend && npm run lint` (détecte erreurs de code)
  3. Tests unitaires : commandes et contraintes agent → **`workflow.md`**. En local humain : `cd frontend && npm test` ou rapports JSON selon scripts du `package.json`.
  4. Tests E2E : `npm run test:e2e` (si serveurs lancés, tests critiques)
- **Script automatisé**: `.\scripts\test-frontend.ps1` (build + lint + tests unitaires), `.\scripts\test-frontend.ps1 -E2E` (inclut E2E).
- **MCP Browser** (si disponible): Pour inspection visuelle, vérifier console logs, network requests, après avoir lancé `npm run dev`.
- **Quand tester**:
  - Après modification composants : build + lint + tests unitaires
  - Avant commit : `.\scripts\test-frontend.ps1` ou `npm run test:frontend`
  - Pour tests E2E : s'assurer que `npm run dev` est lancé, puis `npm run test:e2e`
- **Commandes**:
  - `npm run test:frontend:vitest` : Vitest **rapide**, reporter JSON → `tmp/vitest-report.json`
  - `npm run test:frontend:vitest:full` : Vitest **complet** (CI) → `tmp/vitest-report-full.json`
  - `npm run test:frontend:vitest:summary` : lit `tmp/vitest-report.json` (rapide)
  - `npm run test:frontend` : Build + lint + tests unitaires frontend (script PowerShell automatisé)
  - `npm run test:e2e` : Tests E2E Playwright
  - `npm run test:all` : Backend + frontend (unitaires uniquement)

## Anti-patterns à éviter absolument

### Tests vacueux via garde optionnelle
```typescript
// ❌ INTERDIT — si querySelector retourne null, le bloc entier est skipé
//    le test "passe" sans rien vérifier
const el = container.querySelector('input[type="checkbox"]')
if (el) {
  await user.click(el)
  expect(mock).toHaveBeenCalled()  // jamais atteint si el est null
}

// ✅ CORRECT — assertion explicite avant l'usage
const el = screen.getByRole('checkbox')  // lève une erreur si absent
await user.click(el)
expect(mock).toHaveBeenCalled()
```

### Sélecteur DOM fragile via `closest('div')?.querySelector()`
`getByText('X').closest('div')` retourne le premier div **ancêtre**, pas le conteneur item. Si la checkbox est **sibling** de ce div (pas enfant), `querySelector` ne la trouve pas.
```typescript
// ❌ FRAGILE — closest('div') peut ne pas être le bon conteneur
screen.getByText('Nom').closest('div')?.querySelector('input[type="checkbox"]')

// ✅ ROBUSTE — utiliser getByRole ou remonter d'un niveau
screen.getByRole('checkbox')                              // si unique dans le scope
screen.getByLabelText('Sélectionner Nom')                 // si aria-label présent
getByText('Nom').closest('div')?.parentElement?.querySelector('input[type="checkbox"]')  // si nécessaire
```

### useCallback avec closure périmée (store Zustand)
```typescript
// ❌ STALE — selections est capturé au dernier render, jamais mis à jour
const fn = useCallback(() => {
  doSomethingWith(selections)  // périmé si selections a changé sans re-render
}, [setSuggestions])           // selections absent des dépendances

// ✅ useRef toujours à jour
const selectionsRef = useRef(selections)
selectionsRef.current = selections  // mis à jour à chaque render
const fn = useCallback(() => {
  doSomethingWith(selectionsRef.current)  // toujours frais
}, [])
```

### Hooks de mesure DOM (`useNarrowInlineSize`, `useViewportMode`) en RTL/jsdom

`useNarrowInlineSize` mesure un nœud via `ResizeObserver` + `readLayoutWidthPx` (parent walker `style.width`). En jsdom :

1. **`offsetWidth` / `clientWidth` valent souvent 0** — le hook retombe sur `style.width` en px (ou % remontée aux parents).
2. **Le `ResizeObserver` vit dans un effet**, pas dans la callback ref (refonte UI 2026). La callback ref ne fait que poser le nœud en state ; c'est un `useLayoutEffect` qui branche l'observateur. Sous `React.StrictMode`, un RO créé dans la callback ref serait déconnecté par le cleanup du démontage simulé et **jamais recréé** — les callback refs ne sont pas ré-invoquées — laissant le hook aveugle après le premier paint. Le montage tardif (onglet, drawer) reste couvert. Cf. `frontend/src/hooks/useNarrowInlineSize.test.tsx` et `.claude/rules/ui_redesign_2026.md`.
3. **`waitFor` long** : si un test attend encore un élément narrow sans que le nœud mesuré ne soit jamais monté ou sans largeur explicite en `style`, vérifier le wiring du test avant de suspecter le hook.

**Patterns de test** :

- **Vrai hook + wrapper dimensionné** : utile pour intégration (ex. `Dashboard.combobox-17_7.test.tsx` — conteneur `width: 480` / `1440` après clic sur l’onglet, le workspace se monte et l’effet mesure).
- **Mock du hook** : reste valide pour **accélérer** les suites lourdes ou isoler un composant qui n’a pas besoin de la chaîne Dashboard complète ; utiliser `vi.mock('../../hooks/useNarrowInlineSize', …)` avec des seuils cohérents (`PANEL_COMFORT_MIN_WIDTH_PX`, etc.).
- **Provider** : `<DialogueEditionNarrowProvider value={true}>` dans `UnityDialogueEditor.narrow.test.tsx` quand le composant sous test consomme déjà ce contexte.

**Attention** : combiner `useViewportMode` (`window.innerWidth`) et `useNarrowInlineSize` sans fixer **à la fois** le viewport jsdom et les `style.width` pertinents peut rester fragile — préférer un mock ciblé si le test n’a pas vocation à couvrir la mesure.

## Diagnostic d'un test Vitest qui semble "bloqué"

Symptôme : `npx vitest run` tourne plusieurs minutes sans output ni progression. Méthode de tri rapide :

1. **Vérifier le coût de startup** — sur Windows, le pipeline Vitest (Vite + esbuild + jsdom + setupFiles) prend **20–40 s** sur un fichier moyen au 1er run (cache froid). En dessous, c'est probablement le démarrage. **Ne pas tuer** avant 60 s sur un fichier non-lourd, 2 min sur un fichier de Dashboard complet.
2. **Cibler un fichier minimal** — au lieu de `vitest run -t "pattern"` qui transforme **tous** les fichiers du projet pour matcher, lancer `vitest run path/to/specific.test.tsx --reporter=dot`. Diff de temps typique : 1–5 s vs 30–120 s.
3. **Vérifier la cause d'un `waitFor` long** — si le test attend un élément qui dépend d'un state piloté par un hook DOM (mesure, ResizeObserver, IntersectionObserver, viewport), c'est probablement la cause. Voir section précédente sur `useNarrowInlineSize`.
4. **`Out-String -Width 200`** sur Windows PowerShell — sans ça, la sortie de `node.exe` peut être tronquée ou bufférisée et donner l'impression d'un blocage muet.

Outils :
- `npx vitest run <file> --reporter=dot` : reporter compact, idéal en agent.
- `npx vitest run <file> --reporter=verbose --testTimeout=10000` : timeout par test à 10 s pour forcer un échec rapide.
- `npx vitest list <pattern>` : lister les tests sans les exécuter (utile pour vérifier qu'un nom matche bien).
