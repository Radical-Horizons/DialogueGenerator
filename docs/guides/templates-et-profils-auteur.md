# Templates de génération et profils d'auteur

**Dernière mise à jour :** 2026-08-23
**Référence d'implémentation :** le code et les tests font foi (`services/owned_item_access.py`,
`services/template_service.py`, `services/author_profile_service.py`, `api/routers/templates.py`,
`api/routers/author_profiles.py`, `frontend/src/components/generation/PresetSelector.tsx`).

Ce guide décrit le comportement **livré**, qui correspond désormais à la cible de
l'epic 6 (« Révision — 2026-08-21 : la visibilité devient un statut »).

---

## Les deux objets

Un **template** est une configuration de génération réutilisable : personnages, lieu, type de
scène, brief. Un **profil d'auteur** décrit une voix d'écriture. Ce sont deux objets distincts,
qui partagent le même modèle de possession et de visibilité.

| | Template | Profil d'auteur |
|---|---|---|
| Sur disque | `data/templates/custom/{uuid}.json` | `data/author_profiles/{uuid}.json` |
| Schéma | `api/schemas/template.py` | `api/schemas/author_profile.py` |
| Service | `services/template_service.py` | `services/author_profile_service.py` |

Les deux répertoires `data/` sont **gitignorés** (avec un `.gitkeep`) : ce sont des données
utilisateur, pas du code.

### Convergence : il n'y a plus qu'un objet réutilisable

Trois objets couvraient autrefois la même idée — « une configuration que je réutilise » :
les **presets** (`data/presets/`, avec leur propre menu « Charger preset »), les **fiches
livrées** (`config/prebuilt_templates.json`, en lecture seule) et les templates.
`TemplateConvergenceService` les importe au démarrage comme templates ordinaires, une
seule fois.

Une fiche livrée n'était pas figée par choix de conception : elle l'était parce qu'elle
vivait dans un fichier de config. Convergée, elle s'édite comme le reste.

La convergence **copie** : `data/presets/` et le catalogue restent intacts. Le marqueur
`.convergence-templates-v1` n'est posé qu'après un passage complet, et la reprise se fait
par nom — un passage interrompu ne duplique rien.

⚠️ **Déduplication par nom**, mesurée sur les données réelles : 27 fichiers de presets
pour 5 noms distincts, le reste étant des doublons de tests E2E. Ne pas conclure d'un
écart entre le nombre de fichiers et le nombre de templates que la convergence a échoué.

---

## Possession et visibilité

Deux champs, à ne pas confondre — c'est la confusion qui a coûté le plus cher sur ce chantier.

### `visibility` — un statut persisté

Écrit dans le fichier JSON de l'objet. Deux valeurs :

| Valeur | Sens | Quand |
|---|---|---|
| `shared` | Visible de l'équipe | **Défaut.** Le cas courant. |
| `private` | Visible du seul propriétaire | Brouillon. Une copie démarre toujours ainsi. |

**Qui voit peut modifier.** Un `private` n'est lisible que par son auteur, donc lui seul
l'écrit ; un `shared` est lu par toute l'équipe, donc elle l'édite. `can_write` vaut
`can_read` — le statut porte toute la frontière, et superposer une règle de propriété
rendait la moitié de la liste inerte, y compris pour un admin.

### `relation` — une valeur calculée

Jamais persistée. Calculée **pour l'acteur qui fait la requête**, par
`OwnedItemAccessService.relation()` :

| Valeur | Signification |
|---|---|
| `owned` | L'acteur en est le propriétaire |
| `team` | Partagé par quelqu'un d'autre |
| `legacy` | Aucun `ownerId` — fichier antérieur au modèle |

⚠️ **Le même objet a un `relation` différent selon qui le lit.** `visibility` décrit l'objet ;
`relation` décrit un rapport entre l'objet et un lecteur. Un template `shared` vaut `owned`
pour son auteur et `team` pour ses collègues.

⚠️ **`relation` ne commande plus rien à l'écran.** L'interface n'affiche que le statut, et
les actions dépendent de ce que la session peut écrire — pas de qui a écrit quoi. Un
prédicat `relation === 'team'` avait déjà rendu invisibles les templates des collègues.

### Les objets sans propriétaire

Un fichier écrit avant `ownerId`, ou convergé depuis les presets et le catalogue, n'a pas
de propriétaire. Il est `shared` : visible et **modifiable** par l'équipe.

C'est un effet voulu de `can_write == can_read`. Sous l'ancienne règle, un objet dont le
propriétaire était une session invitée expirée devenait intouchable par quiconque —
admin compris — et s'accumulait dans la liste de tout le monde.

### Une seule implémentation d'ACL

`services/owned_item_access.py` (`OwnedItemAccessService`) porte `relation()`, `can_read()`,
`can_write()`, `can_change_visibility()`, `list_visible()`. Il fonctionne sur un `Protocol`
(`id` / `ownerId` / `visibility`), donc il sert **les deux objets**.
`TemplateAccessService` n'ajoute que `copy_template`.

**Ne pas écrire un second `can_read`.** Ce dépôt a déjà payé deux fois le prix d'un même concept
implémenté deux fois.

---

## Invité : lecture seule

Le mode invité sert à montrer l'application sans créer de compte. Il ne peut **rien écrire**.
Détail, obligations et pièges : `.claude/rules/guest_first_auth.md`.

---

## Surface API

`[compte]` = refusé aux sessions invitées.

### Templates

| Méthode | Route | |
|---|---|---|
| GET | `/api/v1/templates` | Liste filtrée par l'ACL |
| POST | `/api/v1/templates` | `[compte]` |
| GET | `/api/v1/templates/prebuilt` · `/prebuilt/{slug}` | Catalogue |
| GET | `/api/v1/templates/{id}` | 404 si non visible |
| PUT · DELETE | `/api/v1/templates/{id}` | `[compte]` propriétaire ou admin |
| GET | `/api/v1/templates/{id}/validate` | Références GDD obsolètes ; ne mute rien |
| GET | `/api/v1/templates/{id}/versions` | Historique |
| POST | `/api/v1/templates/{id}/versions/{vid}/restore` | `[compte]` |
| POST | `/api/v1/templates/{id}/copy` | `[compte]` — sans appelant frontend |
| POST | `/api/v1/templates/suggestions` | **Lecture** malgré le verbe : renvoie un classement |
| POST | `/api/v1/templates/suggestions/used` | `[compte]` — incrémente un compteur persisté |
| GET · POST | `/api/v1/templates/ab-test` | `[compte]` en POST : dépense du budget LLM |
| GET | `/api/v1/templates/ab-test/{id}` | |
| PATCH | `/api/v1/templates/ab-test/{id}/feedback` | `[compte]` |
| POST | `/api/v1/templates/ab-test/{id}/rerun` | `[compte]` |

### Profils d'auteur

| Méthode | Route | |
|---|---|---|
| GET | `/api/v1/author-profiles` · `/prebuilt` | |
| POST | `/api/v1/author-profiles` | `[compte]` |
| GET · PUT · DELETE | `/api/v1/author-profiles/{id}` | `[compte]` en écriture |

---

## Ce que l'écran affiche

La colonne de génération porte **trois onglets** — `BRIEF`, `FLAGS`, `TEMPLATES` — puis le
contenu de l'onglet, puis un **tiroir replié** de réglages (`GenerationSettingsDrawer` :
modèle, profil d'auteur, règles du jeu, prompt système).

Invariant : **on ne doit jamais perdre la surface d'écriture.** Ouvrir le tiroir n'escamote pas
le brief ; un onglet ramène toujours à quelque chose d'éditable. C'est la régression qui a
motivé cette structure — les réglages étaient des onglets à égalité avec le brief, et les
ouvrir effaçait la zone de saisie.

L'onglet `TEMPLATES` (`PresetSelector.tsx`) affiche **une seule liste**, groupée par
catégorie, avec une pastille de statut par ligne et un filtre `Statut` / `Nom` /
`Catégorie` / `Contexte`. Aucune section : un statut est une propriété d'un élément, pas
un découpage d'écran.

Enregistrer un template se fait **depuis l'onglet Brief** (`BriefTemplateSaver`), sous la
zone de saisie : c'est le brief qui est capturé, et le bouton le dit.

Le profil d'auteur vit dans le tiroir (`AuthorProfilePanel`). Sa **valeur active** — le texte
envoyé au LLM — reste en `localStorage` : ce n'est pas un objet, c'est l'état d'un champ, au
même titre que le brief en cours de frappe. Seuls les profils **nommés** sont des objets serveur.

### Migration depuis le navigateur

Les briefs et profils nommés vivaient autrefois en `localStorage`. Deux migrations les portent
sur le serveur au premier passage (`migrateLocalBriefsToTemplates.ts`,
`migrateLocalAuthorProfiles.ts`). Elles **copient** — rien n'est effacé —, posent leur marqueur
uniquement en cas de succès complet, et reprennent par nom sans créer de doublon. Un échec
laisse l'utilisateur exactement où il était.

---

## Dette connue

L'écart avec l'epic est comblé : liste unique, deux statuts, tout éditable. Ce qui reste
est suivi dans `_bmad-output/implementation-artifacts/deferred-work.md` — écriture non
atomique des profils d'auteur, cache de flags GDD jamais invalidé, schémas orphelins du
marketplace, erreurs non typées dans les deux routeurs.

---

## Pièges vérifiés — ne pas les refaire

- **Un endpoint sans client n'implique pas un fichier sans lecteur.**
  `config/scene_instruction_templates.json` a failli être supprimé avec son endpoint : il
  alimente aussi `scene_instruction_loader`, donc la génération.
- **`model_copy(update=…)` ne revalide pas.** Une valeur hors `Literal` traverse un GET en
  silence, puis fait tomber le premier constructeur Pydantic qui la reçoit. C'est ainsi qu'un
  `relation` désaligné donnait 500 sur les suggestions et rien sur la liste.
- **Une garde ne se conditionne pas au contenu de la requête.** Forcer `private` seulement
  quand le client omet `visibility` laisse passer celui qui le pose explicitement.
- **Un statut ne découpe pas l'écran.** Sections, puis provenances, puis pastilles : à
  trois reprises la même taxonomie a été déplacée au lieu d'être supprimée. Le signal
  est qu'une solution *ajoute* du vocabulaire là où l'utilisateur en demande moins.
- **Le container n'était exercé par aucun test** : les tests A/B injectaient leur propre service
  et masquaient un `AttributeError` qui rendait la fonctionnalité inutilisable.
  Garde : `tests/api/test_container_wiring.py`.

---

## Tests de référence

| Sujet | Fichier |
|---|---|
| Visibilité et ACL (API) | `tests/api/test_templates_visibility.py`, `tests/api/test_author_profiles.py` |
| Invité en lecture seule | `tests/api/test_guest_read_only.py` |
| Câblage du container | `tests/api/test_container_wiring.py` |
| Suggestions et relation `team` | `tests/api/test_templates_suggestions.py` |
| A/B | `tests/api/test_templates_ab_test.py` |
| Migrations navigateur | `frontend/src/utils/migrateLocal*.test.ts` |
| Onglets et tiroir | `frontend/src/components/generation/__tests__/` |

⚠️ `frontend/src/components/generation/__tests__/GenerationPanel.integration.test.tsx` est
**exclu** de la config Vitest et rouge indépendamment de ce chantier. Ce qu'il couvrait — flux
SSE, brouillon `localStorage`, chargement de preset — n'a donc aucun filet actif.
