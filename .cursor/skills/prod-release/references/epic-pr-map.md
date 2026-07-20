# Jalons epic — merges PR → semver

**Règle** : 1 PR epic mergée = **+1 mineure** (1.0.0 → 1.1.0 → … → 1.7.0). Numéro d'epic ≠ numéro de version.

| Tag | Semver | PR | Epic | Commit | Date |
|-----|--------|-----|------|--------|------|
| `v1.1.0` | 1.1.0 | #5 | Epic 1 — Génération | `1e7c100b` | 2026-02-21 |
| `v1.2.0` | 1.2.0 | #25 | Epic 2 — Graphe | `bccc8fcb` | 2026-03-13 |
| `v1.3.0` | 1.3.0 | #27 | Epic 3 — Contexte | `81a00d59` | 2026-03-30 |
| `v1.4.0` | 1.4.0 | #33 | Epic 4 — Validation QA | `f6cc4fd0` | 2026-04-10 |
| `v1.5.0` | 1.5.0 | #39 | Epic 17 — Responsive/PWA | `03729b00` | 2026-06-04 |
| `v1.6.0` | 1.6.0 | #43 | Epic 9 — Variables | `a73255ce` | 2026-06-10 |
| `v1.7.0` | 1.7.0 | #46 | Epic 5 — Export Unity | `2c5a1ed8` | 2026-06-21 |
| `v1.7.1` | 1.7.1 | — | patch main post–Epic 5 | `2dcf3a24` | 2026-06-26 |
| `v1.7.2` | 1.7.2 | — | patch main (playthrough + GDD sync) | `60c779ec` | 2026-07-06 |
| `v1.8.0` | 1.8.0 | *(tag après deploy)* | Epic 7 — Collaboration / RBAC | `9d8dea45` | 2026-07-20 |

Baseline : `v1.0.0` → `fe9c3374`. Doc complète : `docs/releases/semver-and-tags.md`.

Prochaine epic mergée → **1.9.0**. Patches main entre deux epics → **1.8.1**, **1.8.2**, …

```powershell
git log --oneline --merges --grep="Epic" -20
git rev-list --count <commit_epic_N>..<commit_epic_N+1>
git rev-list --count v1.7.0..HEAD   # patches depuis dernière mineure
```
