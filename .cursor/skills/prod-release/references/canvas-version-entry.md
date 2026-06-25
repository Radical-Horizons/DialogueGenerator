# Entrée canvas `VERSIONS`

Fichier : `canvases/app-versions.canvas.tsx` sous le dossier projet Cursor  
(ex. `%USERPROFILE%\.cursor\projects\f-Projets-Notion-Scrapper-DialogueGenerator\canvases\app-versions.canvas.tsx`).

## Règles

1. **Ordre** : la plus récente en **premier** dans le tableau `VERSIONS`.
2. **Supprimer** l’entrée `id: "unreleased"` une fois la prod faite ; la remplacer par la version semver réelle.
3. **`commitCount`** : `git rev-list --count vPREcedente..HEAD` (ou sortie du script `list-commits-since-prod.ps1`).
4. **`commitRef`** : hash court du commit déployé (HEAD de `main` au moment du tag).
5. **`pr`** / **`epic`** : merge PR (ex. `PR #46`, `Epic 5`) — voir `references/epic-pr-map.md`
6. **`highlights`** : 2–4 groupes thématiques, 3–5 puces chacun — **synthèse humaine** des commits, pas la liste brute.
7. **`bump`** : cohérent avec le bump npm (`major` | `minor` | `patch`).
8. **`status`** : `"prod"` pour la dernière version en production ; `"unreleased"` pour HEAD non déployé ; `"released"` pour l'historique.
9. **`chartLabel`** : libellé court pour le graphique (`E4`, `1.2.0`, …) ; omettre si hors graphique.

## Gabarit

```typescript
{
  id: "1.3.0",
  semver: "1.3.0",
  bump: "minor", // major | minor | patch — ton choix documenté
  date: "2026-06-26",
  title: "Titre court (epic ou thème principal)",
  summary:
    "Une ou deux phrases : delta depuis la dernière prod, pour qui, impact principal.",
  commitCount: 18,
  commitRef: "abc1234",
  tag: "v1.3.0",
  status: "released",
  highlights: [
    {
      label: "Thème 1",
      items: [
        "Point utilisateur concret 1",
        "Point utilisateur concret 2",
      ],
    },
    {
      label: "Thème 2",
      items: ["…"],
    },
  ],
},
```

## Entrée « en cours » (avant prod)

Tant qu’il n’y a pas eu de deploy :

```typescript
{
  id: "unreleased",
  semver: "1.3.0-dev", // ou prochaine semver prévue
  bump: "minor",
  date: "YYYY-MM-DD",
  title: "…",
  summary: "Travail sur HEAD — N commits depuis vX.Y.Z.",
  commitCount: N,
  commitRef: "<hash HEAD>",
  status: "unreleased",
  highlights: [ /* brouillon depuis git log */ ],
},
```

Mettre à jour le graphique : les `commitCount` du tableau alimentent le `BarChart` (filtrer `commitCount > 0`).
