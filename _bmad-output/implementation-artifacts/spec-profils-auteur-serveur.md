---
title: 'Profils d''auteur — objet serveur avec statut de visibilité'
type: 'refactor'
created: '2026-08-19'
status: 'in-review'
review_loop_iteration: 0
baseline_commit: '0bece45f44f242001d08102c203726ee910eb7f5'
context:
  - '{project-root}/.claude/rules/ui_redesign_2026.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem :** le profil d'auteur est le dernier vestige du modèle démonté aux lots 1 et 2. Ses
profils nommés vivent en `localStorage` (donc perdus au changement de navigateur, sans que rien
ne le dise), son catalogue est un troisième fichier de config, et la valeur active est encore
une autre clé navigateur. Trois stockages pour un objet.

**Approach :** le même modèle que les templates, appliqué à un **objet distinct** — un profil
d'auteur n'est pas une configuration de génération, il décrit une voix. Objet serveur avec
`ownerId` et `visibility` (`shared` par défaut, `private` pour un brouillon), les profils locaux
migrent, et le catalogue des quatre voix devient un jeu de pré-built comme pour les templates.

## Boundaries & Constraints

**Always :**
- Aucune perte de donnée : un profil local devient un profil serveur **avant** que sa clé ne soit
  abandonnée ; la migration copie et se reprend par nom, comme celle des briefs.
- Une seule implémentation d'ACL : le service d'accès des templates est généralisé, pas dupliqué.
  Un second `can_read`/`can_write` serait la faute qu'on vient de corriger deux fois.
- La valeur **active** du profil (le texte envoyé au LLM) reste ce qu'elle est aujourd'hui :
  une valeur de session, pas un objet. Seuls les profils **nommés** deviennent des objets.
- Le profil d'auteur alimente 8 consommateurs (requête de génération, estimation de tokens,
  aperçu de prompt) : aucun ne change de contrat.

**Ask First :**
- Supprimer la clé `localStorage` de la valeur active — elle assure la persistance entre deux
  sessions et n'a pas d'équivalent serveur aujourd'hui.
- Faire du profil d'auteur un champ du template plutôt qu'un objet distinct.

**Never :**
- Ne pas dupliquer `TemplateAccessService` : le généraliser.
- Ne pas introduire de nouveau stockage navigateur pour un objet métier.
- Ne pas toucher au contrat des 8 consommateurs du profil actif.

## I/O & Edge-Case Matrix

| Scénario | Entrée / État | Comportement attendu | Gestion d'erreur |
|---|---|---|---|
| Migration au démarrage | N profils locaux nommés | N profils serveur créés en `private`, clé marquée migrée | Échec → rien n'est marqué, locaux conservés |
| Migration rejouée | Marqueur présent | Aucun appel réseau, aucun doublon | N/A |
| Migration partielle | 2 sur 4 créés puis échec | Les 2 restent, marqueur absent, reprise par nom sans doublon | N/A |
| Création | Nouveau profil nommé | `visibility: 'shared'`, propriétaire = l'acteur | N/A |
| Profil privé d'autrui | Liste demandée par un collègue | Absent de la liste ; GET direct → 404 | N/A |
| Changement de statut | Profil d'autrui | 403 — propriétaire ou admin uniquement | Message explicite |
| Pré-built | Les 4 voix du catalogue | Listées, non modifiables, non supprimables | Tentative de PUT → 404 |
| Appliquer un profil | Clic sur un profil | Son texte remplit le champ actif ; les 8 consommateurs le voient | N/A |

</frozen-after-approval>

## Code Map

- `services/template_access_service.py` -- à généraliser (protocole `id` / `ownerId` /
  `visibility`) pour servir templates **et** profils.
- `api/schemas/author_profile.py` (nouveau) -- `AuthorProfile`, `AuthorProfileCreate/Update`.
- `services/author_profile_service.py` (nouveau) -- CRUD fichiers sous `data/author_profiles/`,
  calqué sur `TemplateService` (UUID, validation de chemin).
- `api/routers/author_profiles.py` (nouveau) -- CRUD + `/prebuilt`.
- `config/author_profile_templates.json` -- 4 voix (`default`, `literary`, `minimal`,
  `humorous`), deviennent les pré-built ; l'endpoint `/config/author-profile-templates` part.
- `frontend/src/utils/localNamedTemplates.ts` -- `STORAGE_AUTHOR_KEY` retiré après migration ;
  le fichier disparaît entièrement (la clé scène est déjà partie au lot 1).
- `frontend/src/hooks/useAuthorProfile.ts` -- garde la valeur active en `localStorage`.
- `frontend/src/components/generation/AuthorProfilePanel.tsx` -- liste serveur + statut.
- `api/container.py`, `api/dependencies.py` -- câblage.

## Tasks & Acceptance

**Execution :**
- [ ] `services/template_access_service.py` -- généraliser sur un protocole ; les templates
  continuent de passer par lui sans changement de comportement.
- [ ] `api/schemas/author_profile.py` + `services/author_profile_service.py` -- objet, CRUD
  fichier, statut `shared` par défaut, pré-built depuis le catalogue.
- [ ] `api/routers/author_profiles.py` + câblage container/dependencies.
- [ ] `frontend/src/api/authorProfiles.ts` + store -- client API.
- [ ] `frontend/src/utils/migrateLocalAuthorProfiles.ts` (nouveau) -- migration idempotente,
  reprise par nom, marqueur au succès complet.
- [ ] `AuthorProfilePanel.tsx` -- liste serveur, pastille de statut, application au champ actif ;
  retrait des modèles locaux.
- [ ] `frontend/src/utils/localNamedTemplates.ts` -- supprimé une fois la migration en place.
- [ ] Tests -- accès généralisé (pytest), CRUD + statut (pytest), migration (Vitest), panneau (Vitest).
- [ ] E2E -- un parcours « créer un profil → partagé → passer en privé → appliquer ».

**Acceptance Criteria :**
- Étant donné des profils locaux, quand j'ouvre le tiroir une première fois, alors je les
  retrouve côté serveur et un second passage n'en duplique aucun.
- Étant donné un profil que je crée, quand je ne fais rien de plus, alors il est partagé.
- Étant donné un profil privé d'un collègue, quand je liste, alors je ne le vois pas.
- Étant donné `localNamedTemplates.ts`, quand le lot est fini, alors le fichier n'existe plus.

## Design Notes

Trois objets, un seul modèle d'accès :

```
Template       ownerId · visibility   → ce que je réutilise pour générer
AuthorProfile  ownerId · visibility   → la voix que j'applique
(prebuilt)     lecture seule          → les points de départ fournis
```

Le service d'accès devient générique plutôt que dupliqué. C'est la contrainte la plus
importante du lot : deux implémentations d'ACL divergent toujours, et on vient de payer
deux fois le prix d'un même concept écrit deux fois.

La **valeur active** du profil reste une valeur de session en `localStorage`, comme le brief
reste un texte de formulaire. Ce n'est pas une exception au « tout sur le serveur » : ce n'est
pas un objet, c'est l'état d'un champ.

## Verification

**Commands :**
- `npm run test:backend:fast` -- expected : vert
- `cd frontend && npx tsc --noEmit && npm run lint` -- expected : 0
- `cd frontend && npx vitest run --reporter=dot` -- expected : vert
- `npx playwright test e2e/templates-*.spec.ts e2e/author-profiles*.spec.ts --workers=1`

**Manual checks :**
- Poser deux profils locaux, recharger : ils apparaissent côté serveur, marqués privés, et un
  second rechargement n'en crée pas d'autres. Appliquer un profil remplit bien le champ actif.
