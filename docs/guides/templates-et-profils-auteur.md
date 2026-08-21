# Templates de génération et profils d'auteur

**Dernière mise à jour :** 2026-08-21
**Référence d'implémentation :** le code et les tests font foi (`services/owned_item_access.py`,
`services/template_service.py`, `services/author_profile_service.py`, `api/routers/templates.py`,
`api/routers/author_profiles.py`, `frontend/src/components/generation/PresetSelector.tsx`).

Ce guide décrit le comportement **livré**. Là où il diverge de l'intention, la section
[Écarts connus](#écarts-connus) le dit explicitement plutôt que de décrire l'intention.

---

## Les deux objets

Un **template** est une configuration de génération réutilisable : personnages, lieu, type de
scène, brief. Un **profil d'auteur** décrit une voix d'écriture. Ce sont deux objets distincts,
qui partagent le même modèle de possession et de visibilité.

| | Template | Profil d'auteur |
|---|---|---|
| Créé par l'utilisateur | `data/templates/custom/{uuid}.json` | `data/author_profiles/{uuid}.json` |
| Catalogue fourni | `config/prebuilt_templates.json` — **10 fiches** | `config/author_profile_templates.json` — **4 voix** |
| Schéma | `api/schemas/template.py` | `api/schemas/author_profile.py` |
| Service | `services/template_service.py` | `services/author_profile_service.py` |

Les deux répertoires `data/` sont **gitignorés** (avec un `.gitkeep`) : ce sont des données
utilisateur, pas du code.

Les fiches du catalogue sont en **lecture seule**. Elles ne sont ni modifiables ni supprimables :
un `PUT` ou un `DELETE` sur un slug de catalogue répond 404, parce que les routes `/{id}` exigent
un UUID.

---

## Possession et visibilité

Deux champs, à ne pas confondre — c'est la confusion qui a coûté le plus cher sur ce chantier.

### `visibility` — un statut persisté

Écrit dans le fichier JSON de l'objet. Deux valeurs :

| Valeur | Sens | Quand |
|---|---|---|
| `shared` | Visible de l'équipe | **Défaut.** Le cas courant. |
| `private` | Visible du seul propriétaire | Brouillon. Une copie démarre toujours ainsi. |

Seul le propriétaire (ou un admin) peut changer ce statut.

### `relation` — une valeur calculée

Jamais persistée. Calculée **pour l'acteur qui fait la requête**, par
`OwnedItemAccessService.relation()` :

| Valeur | Signification |
|---|---|
| `owned` | L'acteur en est le propriétaire |
| `team` | Partagé par quelqu'un d'autre |
| `legacy` | Aucun `ownerId` — fichier antérieur au modèle |

⚠️ **Le même objet a un `relation` différent selon qui le lit.** `visibility` décrit l'objet ;
`relation` décrit une relation entre l'objet et un lecteur. Un template `shared` vaut `owned`
pour son auteur et `team` pour ses collègues.

### Le cas `legacy`

Un fichier écrit avant l'introduction d'`ownerId` n'a pas de propriétaire. Il est **lisible par
tous** et **modifiable par le seul admin** — pas par le premier venu qui peut le lire.

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
| POST | `/api/v1/templates/{id}/copy` | `[compte]` — voir Écarts |
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

L'onglet `TEMPLATES` (`PresetSelector.tsx`) affiche **deux sections empilées** :
`Templates pré-built`, puis `Mes templates` avec ses filtres.

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

## Écarts connus

Cette section est la raison d'être du guide : ce qui est livré ne correspond pas partout à
l'intention. Ne pas la supprimer sans avoir corrigé ce qu'elle décrit.

### 1. Deux listes pour un statut — et un template partagé qui n'apparaît nulle part

L'intention était **une** liste, la visibilité n'étant qu'un statut porté par chaque élément.
Le livré empile deux sections (`Templates pré-built`, `Mes templates`), ce qui rejoue le motif
que ce chantier devait supprimer : une même notion découpée en sections par un critère qui n'en
est pas un. Aucune application grand public ne procède ainsi — un badge et un filtre dans une
liste unique sont la forme attendue.

Conséquence concrète, plus grave que l'esthétique :

```ts
// PresetSelector.tsx
const ownedTemplates = templates.filter((t) => t.relation !== 'team')
```

**Aucune section ne rend ce que ce filtre exclut.** Un template partagé par un collègue est
chargé, passe l'ACL, arrive dans `templates` — et disparaît de la seule liste qui l'affichait.

Ce filtre était longtemps mort : il testait `relation === 'granted'`, valeur que le serveur
n'émet plus depuis le retrait du partage nominatif. Aligner le prédicat sur `'team'` l'a rendu
vivant, donc nuisible. Aucun test Vitest ne couvre l'affichage d'un template `team`.

### 2. `POST /templates/{id}/copy` n'a aucun appelant

Le bouton « Copier vers mes templates » d'une fiche de catalogue **ne passe pas** par cette
route : il appelle `POST /templates` avec la configuration du pré-built
(`handleCopyPrebuilt`). La route `/copy` sert à dupliquer un template **custom** ; son client
`copyTemplateApi` n'est référencé que par un mock de test.

Elle reste exposée et fonctionnelle (400 sur un slug de catalogue, 403/404 selon l'accès).

### 3. Reliquats du marketplace retiré

`api/schemas/template.py` conserve neuf classes Pydantic orphelines (partage nominatif,
marketplace). `VALID_SOURCES` du dépôt de suggestions accepte encore `"marketplace"`, que le
service n'émet plus. Sans effet, mais trompeur à la lecture.

### 4. Écriture non atomique des profils d'auteur

`AuthorProfileService._save()` écrit directement, là où `TemplateService` passe par un fichier
temporaire puis un `replace()` atomique. Une interruption en cours d'écriture laisse un JSON
tronqué. `update` et `delete` du routeur profils n'ont pas non plus les `except OSError` que
leurs équivalents templates ont.

### 5. Cache de flags GDD jamais invalidé

`_FLAG_NOMS_CACHE` (`services/template_suggestion_service.py`) est un global de module chargé
une fois pour la durée du process. Une resync Notion ne le rafraîchit pas : le scoring
« rencontre initiale » continue sur la liste capturée au premier appel.

### 6. Erreurs non typées

Les deux routeurs lèvent des `HTTPException` brutes plutôt que la hiérarchie
`api/exceptions.py`. Leurs 500 ne remontent donc pas à Sentry et perdent leur code structuré —
ce qui a précisément retardé la détection de deux bugs bloquants.

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
