# commit

Stage all, commit with an explicit concise message, then push **only if CI T3 is green**.

## Gate obligatoire (push vers `main`)

Avant tout `git push` vers `main`, exécuter la suite équivalente CI push main (voir `.cursor/rules/ci_before_push.mdc`) :

1. `npm run test:backend:full`
2. `cd frontend && set VITEST_FULL=1&& npx vitest run --max-workers=2`
3. `npm run test:e2e:pwa`

**Ne pas push** si l'une de ces commandes échoue. Corriger, relancer, prouver le vert.

## Étapes

1. Exécuter la gate CI ci-dessus (si push vers `main` demandé ou branche courante = `main`).
2. `git add .` à la racine du dépôt.
3. `git commit` avec message concis (pourquoi, pas inventaire de fichiers).
4. `git push` uniquement si la gate est verte.
