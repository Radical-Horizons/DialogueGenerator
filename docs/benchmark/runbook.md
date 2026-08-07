# Runbook — lancer un benchmark

Comment lancer une mesure réelle, de bout en bout. Écrit après le premier run
facturé : tout ce qui suit a été exécuté, rien n'est supposé.

> **Il n'y a ni UI ni CLI à ce jour.** Le mode benchmark s'utilise par appels REST.
> Une CLI et trois écrans figurent au travail différé.

## Ce que ça coûte

Mesuré, `gpt-5.6-luna` vs `gpt-5.6-terra`, juge `gpt-5.6-sol` :

| Étape | Volume | Coût |
|---|---|---|
| Générations `alteir-smoke` (3 cas × 2 modèles × K=1) | 6 fragments de 4 panneaux | **0,25 $** |
| Notation rubrique | 1 verdict par génération valide | ~0,08 $ / verdict |
| Duels | 1 duel par cas où les deux modèles sont valides | ~0,10 $ / duel |

Un smoke complet revient à **moins d'un dollar**. `alteir-standard` avec 3 modèles
et K=3 est de l'ordre de **4 à 8 $** — le plafond budgétaire du run est dur,
utilisez-le.

## Prérequis, et les deux pièges

1. **`OPENAI_API_KEY`** doit être chargée. Sans elle le backend bascule
   silencieusement sur `DummyLLMClient` : le run « réussit » et ne mesure rien.
   Le diagnostic de modèles renvoyé au lancement (`model_diagnostics`) le dit —
   le lire.
2. **Depuis un worktree git**, deux pièges :
   - `.env` n'est **pas** recopié par `git worktree add`. Charger celui du dépôt
     principal dans l'environnement du processus plutôt que dupliquer un fichier
     de secrets.
   - `node scripts/getPythonPath.js` résout le **Python global**, pas le venv.
     Utiliser directement `<dépôt principal>/.venv/Scripts/python.exe`.

## Démarrer l'API

```bash
npm run start:api
```

Depuis un worktree, lancer plutôt un petit script Python qui charge le `.env` du
dépôt principal (`load_dotenv(...)`), pose `API_PORT`, `DISABLE_AUTH=true`, puis
`uvicorn.run(app, ...)` — en insérant la racine du worktree dans `sys.path` et en
faisant `os.chdir` dessus, sinon les modules `api` / `services` sont introuvables.

Les endpoints de run et de verdicts sont **réservés à l'admin**. En local,
`DISABLE_AUTH=true` évite la manipulation de credentials ; sinon, obtenir un JWT
(`admin` / `admin123` en dev).

## La séquence

Base : `/api/v1/benchmark`. Les suites et la grille sont **semées au démarrage**,
il n'y a rien à créer.

```bash
curl -s http://127.0.0.1:4243/api/v1/benchmark/suites
```

`alteir-smoke` (3 cas) et `alteir-standard` (5 cas) doivent apparaître.

```bash
curl -s http://127.0.0.1:4243/api/v1/benchmark/criteria
```

La grille s'appelle **`grille-dialogue-fr`**. Ce n'est pas `default` — une erreur
faite au premier run.

**1. Lancer les générations.** Il n'existe pas d'endpoint d'estimation séparé :
`POST /runs` renvoie l'estimation *et* démarre le run, sous plafond budgétaire dur.

```bash
curl -s -X POST http://127.0.0.1:4243/api/v1/benchmark/runs -H "Content-Type: application/json" -d '{"suite_id":"alteir-smoke","models":["gpt-5.6-luna","gpt-5.6-terra"],"repetitions":1,"budget_cap_usd":0.80,"narration_mode":"sans"}'
```

Suivre : `GET /runs/progress` jusqu'à `"active": false`.

**2. Noter (jambe absolue).**

```bash
curl -s -X POST http://127.0.0.1:4243/api/v1/benchmark/runs/<RUN_ID>/judge -H "Content-Type: application/json" -d '{"grid_id":"grille-dialogue-fr","judge_model":"gpt-5.6-sol","budget_cap_usd":0.60}'
```

Suivre : `GET /judge/progress`.

**3. Comparer (jambe relative).** Même corps, sur `/judge/pairwise` ; suivre via
`GET /pairwise/progress`.

**4. Lire.** `GET /runs/<RUN_ID>/generations`, `/verdicts?judge_model=…`,
`/pairwise?judge_model=…`.

## Lire les résultats sans se tromper

- **Le taux de validité est une mesure de premier ordre**, pas un détail
  technique. Une génération recalée est exclue des moyennes, jamais notée zéro.
- **Le juge est enregistré avec chaque note.** Ne jamais agréger des notes de
  juges différents.
- **`narration_mode` fait partie de l'identité du run.** Deux runs de modes
  différents ne se comparent pas.
- **Les duels sont joués dans les deux sens.** Un fort taux de désaccord entre
  les deux passes sur un cas signale un juge instable sur ce cas — c'est une
  information, pas un bruit à moyenner.
- Avec 3 cas et K=1, **rien n'est statistiquement départagé**. Le smoke valide la
  chaîne, il ne classe pas des modèles.

## Modifier ce qui est mesuré

- **Cas** : `services/benchmark_suite_seed.py` est la source de vérité. Les
  fichiers sous `data/benchmarks/` en sont dérivés et gitignorés ; supprimer
  `data/benchmarks/suites/` puis redémarrer l'API les régénère.
- **Critères** : `services/benchmark_criteria_seed.py`, même principe.
- Une suite écrite à la main s'exporte via `GET /suites/{id}/export`.

## Références

- `docs/benchmark/eq-bench-reference.md` — d'où vient le protocole, ce qu'on
  reprend d'EQ-Bench et ce qu'on en écarte.
- `_bmad-output/implementation-artifacts/spec-benchmark-*.md`,
  `spec-dialogue-fragment-single-call.md` — décisions et invariants.
- `_bmad-output/implementation-artifacts/deferred-work.md` — CLI, UI, classement
  Elo, Connaissances.
