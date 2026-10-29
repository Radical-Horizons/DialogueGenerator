---
title: 'Story 6.8 — Liste unique de templates avec pastille et filtre'
type: 'refactor'
created: '2026-08-21'
status: 'in-review'
review_loop_iteration: 0
baseline_commit: 'b124dfadb'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/.claude/rules/ui_redesign_2026.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem :** le sélecteur empile deux sections — « Templates pré-built » puis « Mes
templates » — héritées du modèle de partage nominatif retiré au lot 2. La visibilité
étant un statut, pas une catégorie, ce découpage n'a plus d'objet et rejoue l'erreur que
l'epic 6 devait supprimer. Pire : `templates.filter(t => t.relation !== 'team')` exclut
les templates partagés par un collègue sans qu'aucune section ne les affiche — ils sont
**invisibles**, alors que « partagé » est le défaut.

**Approach :** une liste unique réunissant le catalogue fourni, mes templates et ceux de
l'équipe. Chaque ligne porte une pastille disant sa provenance et son statut ; un filtre
au-dessus restreint la liste. Les actions disponibles dépendent de la ligne, pas de sa
section.

## Boundaries & Constraints

**Always :**
- Une **seule** liste. Aucune section empilée, aucun titre de groupe.
- Un template d'équipe est **visible** et applicable, jamais modifiable ni supprimable.
- Un pré-built reste en lecture seule ; il se copie pour devenir modifiable.
- Le filtre est réversible sans rechargement et n'altère aucune donnée.
- Les libellés de pastille sont en français et lisibles sans jargon (`team` → « équipe »).

**Ask First :**
- Retirer une action existante d'une ligne (charger, éditer, supprimer, copier, A/B).
- Changer l'ordre de tri par défaut de la liste.

**Never :**
- Ne pas réintroduire une notion de section, même repliée.
- Ne pas filtrer un item hors de la liste sans qu'un filtre explicite de l'utilisateur le demande.
- Ne pas toucher au contrat d'API ni aux schémas : la donnée nécessaire est déjà servie.

## I/O & Edge-Case Matrix

| Scénario | Entrée / État | Comportement attendu | Gestion d'erreur |
|---|---|---|---|
| Liste au repos | Catalogue + mes templates + ceux de l'équipe | Une liste unique, tous présents, chacun avec sa pastille | N/A |
| Template partagé d'un collègue | `relation: 'team'` | **Visible**, applicable ; ni bouton éditer ni bouton supprimer | N/A |
| Mon brouillon | `relation: 'owned'`, `visibility: 'private'` | Pastille « privé », édition et suppression disponibles | N/A |
| Pré-built | Fiche du catalogue | Pastille « fourni », bouton copier ; pas d'édition | N/A |
| Template sans propriétaire | `relation: 'legacy'` | Visible comme un item d'équipe, non modifiable | N/A |
| Filtre « mes brouillons » | Sélection utilisateur | Seuls mes `private` restent ; retour à « tous » restaure la liste | N/A |
| Filtre sans résultat | Aucun item ne correspond | Message disant ce qui s'afficherait, filtre toujours modifiable | N/A |
| Catalogue en erreur | `prebuiltError` | Les templates custom restent affichés ; l'erreur est signalée sans vider la liste | Message d'erreur inline |

</frozen-after-approval>

## Code Map

- `frontend/src/utils/templateCatalog.ts` (nouveau) -- fusionne pré-built et custom en items
  normalisés (`provenance`, `visibility`, libellé de pastille) ; logique pure, testable seule.
- `frontend/src/components/generation/PresetSelector.tsx` -- retire les deux `<h3>` de section
  et les deux boucles de rendu ; une seule liste ; ajoute le filtre de provenance.
  `ownedTemplates` disparaît — c'est lui qui masquait les templates d'équipe.
- `frontend/src/components/generation/TemplateCatalogRow.tsx` (nouveau) -- une ligne de la
  liste : pastille, métadonnées, actions selon la provenance.
- `frontend/src/utils/templateGroups.ts` -- `filterTemplates` s'applique désormais aux items
  unifiés ; retirer les helpers marketplace orphelins au passage.
- `frontend/src/types/template.ts` -- type de l'item unifié.
- `frontend/src/__tests__/PresetSelector.test.tsx` -- les tests qui s'appuyaient sur les
  sections doivent viser la liste unique.

## Tasks & Acceptance

**Execution :**
- [x] `frontend/src/utils/templateCatalog.ts` -- `buildTemplateCatalog(prebuilts, templates)`
  renvoyant les items unifiés + `filterCatalog(items, criteres)` ; provenance dérivée de
  `relation` (`owned` → mien, `team`/`legacy` → équipe, pré-built → fourni).
- [x] `frontend/src/utils/templateCatalog.test.ts` -- couvrir la matrice I/O ligne à ligne,
  **dont** le cas « template d'équipe présent dans le résultat » (celui qui manquait).
- [x] `frontend/src/components/generation/TemplateCatalogRow.tsx` -- ligne avec pastille et
  actions conditionnées par la provenance.
- [x] `PresetSelector.tsx` -- une liste, un filtre de provenance ajouté aux filtres existants ;
  suppression des sections et de `ownedTemplates`.
- [x] `frontend/src/utils/templateGroups.ts` -- adapter le filtrage, retirer les helpers
  marketplace sans appelant.
- [x] Tests -- adapter `PresetSelector.test.tsx` ; ajouter un test « un template `team`
  s'affiche dans la liste » qui échoue sur le code actuel.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- retirer l'entrée traitée.

**Acceptance Criteria :**
- Étant donné un template partagé par un collègue, quand j'ouvre l'onglet Templates, alors je
  le vois dans la liste et je peux l'appliquer.
- Étant donné la liste affichée, quand je la parcours, alors aucun titre de section ne la
  découpe et chaque ligne porte une pastille.
- Étant donné le filtre, quand je choisis une provenance puis reviens à « tous », alors la
  liste complète revient sans rechargement.
- Étant donné un pré-built, quand je le regarde, alors il n'offre ni édition ni suppression.

## Design Notes

Un item unifié porte ce qu'il faut pour l'affichage et les actions, sans perdre sa source :

```ts
interface CatalogueItem {
  key: string                       // 'prebuilt:salutation' | uuid
  provenance: 'fourni' | 'mien' | 'equipe'
  visibility: 'shared' | 'private' | null   // null pour un fourni
  badge: string                     // « fourni » | « partagé » | « privé » | « équipe »
  source: { kind: 'prebuilt'; value: PrebuiltTemplate } | { kind: 'custom'; value: Template }
}
```

`legacy` est rendu comme « équipe » : du point de vue de l'utilisateur, c'est un template
qu'il voit sans en être propriétaire. La nuance (seul un admin peut l'écrire) est déjà
portée par l'absence de bouton d'édition, elle n'a pas à devenir une pastille de plus.

La pastille dit **provenance et statut d'un coup** parce que les deux ne se combinent que de
quatre façons utiles. Deux pastilles séparées rendraient chaque ligne bavarde pour une
information que l'utilisateur lit d'un coup d'œil.

## Verification

**Commands :**
- `cd frontend && npx vitest run src/utils/templateCatalog.test.ts --reporter=dot` -- vert
- `cd frontend && npx vitest run src/__tests__/PresetSelector.test.tsx --reporter=dot` -- vert
- `cd frontend && npx tsc --noEmit && npm run lint` -- 0 / 0
- `cd frontend && npx vitest run --reporter=dot` -- suite complète verte

**Manual checks :**
- Deux comptes : A crée un template (partagé par défaut), B ouvre l'onglet Templates et **le
  voit**, avec la pastille « équipe » et sans bouton supprimer. A le passe en privé, B recharge :
  il disparaît.
