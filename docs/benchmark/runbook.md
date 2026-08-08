# Runbook — lancer un benchmark

Comment lancer une mesure réelle, de bout en bout. Écrit après le premier run
facturé : tout ce qui suit a été exécuté, rien n'est supposé.

## Par l'interface (chemin normal)

`npm run dev`, connexion en **admin**, menu déroulant en haut à droite →
**Administration** → onglet **Benchmark** (`/admin?tab=benchmark`).

Trois vues, dans l'ordre de la boucle :

1. **Lancer** — suite, modèles, répétitions, mode de narration, puis
   **Estimer le coût**. L'estimation ne crée aucun run et ne dépense rien ; elle
   affiche la fourchette, le nombre de générations et l'utilisabilité réelle de
   chaque modèle. Le plafond budgétaire se saisit ensuite, pré-rempli à 120 % de
   l'estimation haute. Le bouton de lancement reste inerte si un modèle n'a pas
   de tarif, si **aucun** modèle n'est utilisable, ou si le plafond est sous
   l'estimation basse. En revanche **un** modèle inutilisable parmi d'autres ne
   bloque pas : le run mesure les autres et produit des `config_error` pour
   celui-là — le rapport les compte à part, hors du taux de validité.
2. **Suivi** — progression, dépense courante face au plafond, cas et modèle en
   cours, et les trois contrôles : suspendre, reprendre, **annuler**. Le sondage
   s'arrête de lui-même à la fin du run.
3. **Rapport** — choisir le run, puis **Noter ce run** : grille, modèle juge,
   duels ou non, plafond budgétaire de la notation. Générer ne suffit pas — sans
   passe de jugement, le rapport n'a aucune note à montrer. La rubrique note
   chaque génération seule ; les duels comparent les modèles deux à deux dans les
   deux sens. Les deux passes ont leur progression et leurs contrôles.
   Puis **Afficher le rapport** : validité et coût par modèle, puis un bloc **par
   juge et par version de grille** (note pondérée sur 10, verdicts, échecs du
   juge, bilan des duels). Les agrégats viennent de `GET /runs/{id}/report` :
   l'écran n'en calcule aucun.

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

## Par l'API

Utile en headless, en reprise après incident, ou pour scripter une campagne.

### Prérequis et pièges

1. **`OPENAI_API_KEY`** doit être chargée. Sans elle le backend bascule
   silencieusement sur `DummyLLMClient` : le run « réussit » et ne mesure rien.
   Le diagnostic de modèles renvoyé au lancement (`model_diagnostics`) le dit —
   le lire.
2. **Depuis un worktree git**, quatre pièges :
   - `.env` n'est **pas** recopié par `git worktree add`. Charger celui du dépôt
     principal dans l'environnement du processus plutôt que dupliquer un fichier
     de secrets.
   - `node scripts/getPythonPath.js` résout le **Python global**, pas le venv.
     Utiliser directement `<dépôt principal>/.venv/Scripts/python.exe`.
   - `frontend/node_modules` est absent : `npm ci` dans `frontend/` avant tout
     Vitest, lint ou Vite.
   - `data/app.db` est **recréé vide** par les migrations au premier démarrage, et
     `ADMIN_PASSWORD` n'étant pas dans `.env`, **aucun admin n'est semé** : le
     login échoue en restant sur `/login`, et `/admin` redirige. Copier le
     `data/app.db` du dépôt principal — **API arrêtée**, sinon le verrou Windows
     fait échouer la copie en silence (`cp` renvoie 0 et le fichier ne change pas ;
     vérifier la taille).

### Démarrer l'API

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

### La séquence

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

**1. Chiffrer sans dépenser.** `POST /runs/preview` estime et diagnostique les
modèles **sans créer de run**. Le plafond n'est pas demandé : c'est justement ce
que l'aperçu sert à décider.

```bash
curl -s -X POST http://127.0.0.1:4243/api/v1/benchmark/runs/preview -H "Content-Type: application/json" -d '{"suite_id":"alteir-smoke","models":["gpt-5.6-luna","gpt-5.6-terra"],"repetitions":1,"narration_mode":"sans"}'
```

`launchable: false` porte le motif exact que `POST /runs` opposerait : c'est la
même fonction (`assert_measurable`) des deux côtés. Seule exception, le **plafond**
— il n'existe pas encore au moment de l'aperçu, donc un plafond sous
`estimated_min_usd` passera l'aperçu et sera refusé au lancement.

**2. Lancer les générations.** `POST /runs` renvoie l'estimation *et* démarre le
run, sous plafond budgétaire dur.

```bash
curl -s -X POST http://127.0.0.1:4243/api/v1/benchmark/runs -H "Content-Type: application/json" -d '{"suite_id":"alteir-smoke","models":["gpt-5.6-luna","gpt-5.6-terra"],"repetitions":1,"budget_cap_usd":0.80,"narration_mode":"sans"}'
```

Suivre : `GET /runs/progress` jusqu'à `"active": false`.

**3. Noter (jambe absolue).**

```bash
curl -s -X POST http://127.0.0.1:4243/api/v1/benchmark/runs/<RUN_ID>/judge -H "Content-Type: application/json" -d '{"grid_id":"grille-dialogue-fr","judge_model":"gpt-5.6-sol","budget_cap_usd":0.60}'
```

Suivre : `GET /judge/progress`.

**4. Comparer (jambe relative).** Même corps, sur `/judge/pairwise` ; suivre via
`GET /pairwise/progress`.

**5. Lire.** `GET /runs/<RUN_ID>/report` donne le rapport agrégé (validité par
modèle, notes et duels par juge). Le détail brut reste sur
`GET /runs/<RUN_ID>/generations`, `/verdicts?judge_model=…`, `/pairwise?judge_model=…`.

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
- `_bmad-output/implementation-artifacts/deferred-work.md` — CLI, édition de
  suites depuis l'UI, classement Elo, Connaissances.
