---
title: 'Interface admin de pilotage du mode Benchmark'
type: 'feature'
created: '2026-08-07'
status: 'done'
review_loop_iteration: 0
baseline_commit: '02ef61494b276f9d52f667cceb95930e666dcc1b'
context: ['.claude/rules/benchmark.md', '.claude/rules/responsive_frontend.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le mode benchmark est complet côté backend mais ne s'utilise qu'en `curl`. Personne ne lancera une mesure ainsi : la fonctionnalité existe et reste inaccessible. Une CLI ne résoudrait rien — l'utilisateur a dit qu'il ne s'en servirait pas.

**Approach:** Un onglet **Benchmark** dans `/admin`, déjà atteignable par le menu déroulant en haut à droite, couvrant la boucle complète : **estimer → lancer et suivre → lire**. Deux endpoints manquent pour que l'UI ne réimplémente aucune règle du protocole : un **aperçu** qui estime sans dépenser, et un **rapport** qui agrège côté serveur.

## Boundaries & Constraints

**Always:**
- **Le coût s'affiche avant l'engagement.** `POST /runs` estime *et* démarre ; une UI de dépense doit pouvoir estimer sans démarrer.
- **L'agrégation vit côté serveur.** Taux de validité, moyennes pondérées et taux de victoire sont des règles de protocole (`.claude/rules/benchmark.md`), pas de la mise en forme.
- **Une génération recalée est `invalid`, jamais 0** : hors des moyennes, et son taux affiché au même rang que les notes.
- **Jamais d'agrégat entre juges** : le rapport est groupé par `judge_model`.
- **`narration_mode` fait partie de l'identité du run** et s'affiche partout où un run est nommé.
- Un run en cours est **interruptible depuis l'écran** (pause / reprise / annulation) : c'est la coupure d'urgence d'une dépense.
- Admin uniquement, via `AdminRoute` et `require_admin` existants — aucun nouveau mécanisme d'autorisation.
- Responsive ≥320px, lint à zéro erreur.

**Ask First:**
- Éditer une suite ou la grille **depuis l'UI** : les seeds de code sont la source de vérité.
- Tout élargissement au-delà du compte admin.

**Never:**
- Pas de CLI. Pas de run déclenché autrement que par un clic humain explicite.
- Ne pas recopier en TypeScript seuils, pondérations ou règles d'exclusion du protocole.
- Pas d'Elo, pas d'édition de suite ou de critères, pas de reprise (`/runs/{id}/resume`), pas de comparateur détaillé de duels — déjà en travail différé.
- Ne pas exposer `raw_prompt` ni le contenu des générations ici (audit, lot séparé).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Aperçu | Suite, modèles, répétitions choisis | Fourchette de coût, nombre de générations, diagnostic par modèle — **aucun run créé, aucune dépense** | N/A |
| Modèle sans tarif | Absent du catalogue de prix | Listé en `unpriced_models`, lancement refusé, motif visible | N/A |
| Modèle inutilisable | Hors whitelist, ou clé API absente | `usable: false` + raison, affiché avant lancement | N/A |
| Lancement | Aperçu accepté, plafond saisi, clic explicite | Run démarré, bascule sur le suivi | 409 si un run tourne déjà → message, pas de second run |
| Suivi | Run actif | Progression, dépense vs plafond, cas et modèle courants ; pause / reprise / annulation | Fin du run → arrêt du polling |
| Rapport non jugé | Run fini, zéro verdict | Validité et coûts par modèle ; section notes vide et explicite | N/A |
| Rapport multi-juges | Verdicts de deux juges | Un bloc par juge, jamais fusionnés | N/A |
| Tout recalé | Aucune génération valide | Validité 0 %, aucune moyenne — pas de 0/20 | N/A |
| Non-admin | Writer ou invité | Onglet absent ; URL directe redirigée | 403 backend si appel forcé |

</frozen-after-approval>

## Code Map

- `api/routers/benchmark.py` -- endpoints existants, tous gardés par `_require_admin_user` ; `POST /runs` estime **et** démarre
- `services/benchmark_run_service.py` -- `estimate_cost()` et `diagnose_models()` sont déjà purs et sans effet de bord : l'aperçu les assemble
- `api/schemas/benchmark.py` / `benchmark_judging.py` -- `BenchmarkCostEstimate`, `BenchmarkModelDiagnostic`, `BenchmarkGenerationRecord` ; `RubricVerdict.criteria_snapshot` (poids figés), `PairwiseVerdict.outcomes[]`
- `frontend/src/components/admin/AdminPanel.tsx` + `adminTabs.ts` -- onglets et résolution de `?tab=`
- `frontend/src/components/layout/Header.tsx:400` -- « Administration » déjà conditionné à `role === 'admin' && is_active` : **l'accès demandé existe**
- `frontend/src/components/admin/LlmModelsPanel.tsx` -- gabarit de panneau admin ; `frontend/src/api/config.ts:33` -- liste des modèles pour le sélecteur

## Tasks & Acceptance

**Execution:**
- [x] `api/schemas/benchmark_report.py` -- schémas d'aperçu et de rapport : par modèle (générations, valides, taux, coût), par juge (moyenne pondérée et par critère), duels (victoires/défaites/nuls) -- le rapport est un contrat, pas une vue
- [x] `services/benchmark_report_service.py` -- agrégation : exclure les `invalid`, pondérer par `criteria_snapshot`, grouper par `judge_model`, compter les duels
- [x] `api/routers/benchmark.py` -- `POST /runs/preview` (estimation + diagnostic, **sans créer de run**) et `GET /runs/{run_id}/report`
- [x] `frontend/src/types/benchmark.ts` -- types alignés sur les schémas Pydantic
- [x] `frontend/src/api/benchmark.ts` -- client : suites, aperçu, lancement, progression, contrôles, rapport
- [x] `frontend/src/components/admin/BenchmarkPanel.tsx` -- vues Lancer / Suivi / Rapport ; polling arrêté en fin de run **et** au démontage
- [x] `frontend/src/components/admin/adminTabs.ts` + `AdminPanel.tsx` -- ajouter l'onglet `benchmark`
- [x] `tests/services/test_benchmark_report_service.py` + `tests/api/test_benchmark_report.py` -- lignes serveur du tableau, dont zéro verdict, multi-juges, tout recalé
- [x] `frontend/src/components/admin/BenchmarkPanel.test.tsx` -- aperçu sans lancement, refus sur modèle sans tarif, arrêt du polling

**Acceptance Criteria:**
- Given un admin sur `/admin`, when il ouvre l'onglet Benchmark et choisit suite et modèles, then il voit la fourchette de coût **avant** toute facturation.
- Given un aperçu affiché, when il confirme avec un plafond, then le run démarre et l'écran suit sa progression sans rechargement manuel.
- Given un run en cours, when il clique Annuler, then le run s'arrête et la dépense cesse.
- Given un run terminé et jugé, when il ouvre le rapport, then il lit par modèle le taux de validité et la note pondérée, juges séparés.
- Given un writer ou un invité, when il ouvre le menu en haut à droite, then aucun accès benchmark n'apparaît.

## Spec Change Log

- **Revue (3 couches) — la coupure d'urgence ne survivait pas à un rafraîchissement.**
  Le suivi n'affichait pause / annulation que pour un run lancé dans la même
  session : après un F5, un run facturé continuait sans moyen de l'arrêter depuis
  l'écran, contre l'invariant `Always` du présent document. Corrigé par une
  hydratation au montage (`GET /runs/progress`) ; les contrôles visent désormais
  `progress.run_id` — viser l'identifiant mémorisé au lancement annulerait le
  mauvais run si un autre admin en a démarré un depuis.
- **La garde de lançabilité n'est pas identique des deux côtés — documenté plutôt
  que prétendu.** `assert_measurable` a trois branches ; celle du plafond ne peut
  pas s'évaluer à l'aperçu, puisque le plafond est justement ce que l'aperçu sert
  à décider. L'UI porte donc cette garde (refus sous l'estimation basse), et la
  règle comme le runbook énoncent l'exception au lieu de promettre une
  équivalence fausse.
- **`config_error` sorti du dénominateur du taux de validité.** Une clé API
  absente donnait « 0 % » à un modèle qui n'avait rien écrit — un défaut
  d'environnement lu comme un jugement de qualité. Le rapport publie `attempted`,
  `invalid` et `config_error` séparément.
- **Un juge est identifié par (juge, grille, version).** Regrouper sur le seul nom
  du juge appliquait les poids d'une grille à des notes produites sous une autre
  — exactement ce que `criteria_snapshot` existe pour empêcher.
- **Un verdict illisible n'est plus indistinguable d'un run jamais noté.**
  `except Exception → []` faisait disparaître des mesures payées derrière « pas
  encore noté » ; seul `FileNotFoundError` est normal, le reste lève
  `verdicts_unreadable` jusque dans l'écran.

KEEP : la séparation aperçu / lancement en deux routes, l'agrégation entièrement
serveur, et le refus d'un `dry_run` booléen sur `POST /runs`.

## Design Notes

**Aperçu séparé plutôt que `dry_run` sur `POST /runs`.** Un booléen qui décide « j'estime ou je dépense » se prête à l'accident exact qu'on veut exclure : un défaut de sérialisation qui lance un run facturé. Deux routes distinctes rendent cette erreur impossible par omission.

**Le rapport est un endpoint.** `.claude/rules/benchmark.md` fixe qu'un `invalid` n'est jamais noté zéro et que deux juges ne s'agrègent pas. Écrit en TSX, cela devient une seconde implémentation du protocole, hors de portée de pytest, qui divergera. L'écran affiche des nombres qu'il n'a pas calculés.

## Verification

**Commands:**
- `F:/Projets/DialogueGenerator/.venv/Scripts/python.exe -m pytest tests/ -k "benchmark" -q` -- expected: vert, aucune régression
- `cd frontend && npx vitest run src/components/admin/ --reporter=dot` -- expected: vert
- `npm --prefix frontend run lint` -- expected: zéro erreur

**Manual checks:**
- `npm run dev`, connexion `admin` / `admin123`, menu haut-droite → Administration → onglet Benchmark : l'aperçu affiche fourchette et diagnostic **sans** créer de run (`GET /runs` inchangé). Le lancement réel d'un run facturé est déclenché par l'utilisateur, pas par l'agent.
