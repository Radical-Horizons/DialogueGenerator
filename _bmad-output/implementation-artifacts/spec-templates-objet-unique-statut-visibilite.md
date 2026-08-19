---
title: 'Templates — un objet serveur unique et un statut de visibilité'
type: 'refactor'
created: '2026-08-19'
status: 'draft'
review_loop_iteration: 0
context:
  - '{project-root}/.claude/rules/ui_redesign_2026.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem :** six stockages coexistent pour trois concepts. « Mes briefs (ce navigateur) »
(`localStorage`) et « Mes templates » (serveur) désignent la même chose — un point de départ
réutilisable — et ne diffèrent que par leur lieu de stockage, qui n'est pas un critère de
conception. Un brief local disparaît au changement de navigateur, sans que rien ne le dise.

**Approach :** un seul objet, sur le serveur. La distinction utile n'est pas « local vs
serveur » mais un **statut de visibilité** porté par le template : `shared` (le cas courant,
défaut) ou `private` (brouillon). Les briefs locaux existants migrent, le `localStorage` de
scène disparaît, et le catalogue de départ redevient unique.

## Boundaries & Constraints

**Always :**
- Aucune perte de donnée utilisateur : tout brief local devient un template avant que la clé
  `localStorage` ne soit abandonnée.
- Un template créé est `shared` par défaut — l'équipe est le cas courant.
- `private` reste lisible et modifiable par son seul propriétaire (et un admin).
- Le catalogue de départ est **unique** : les entrées de `scene_instruction_templates.json`
  absentes des pré-built y sont ajoutées, puis le fichier et son endpoint sont retirés.

**Ask First :**
- Toute suppression d'une clé `localStorage` avant confirmation que la migration a réussi.
- Changer le défaut `shared` — il rend un template visible de l'équipe dès sa création.

**Never :**
- Ne pas toucher au partage nominatif (`template_shares`) ni au marketplace dans **ce lot** :
  leur retrait est le lot 2 de la même correction de PR — séquencé, pas différé.
- Ne pas toucher au profil d'auteur ni à son `localStorage` : lot 3, objet distinct.
- Ne pas introduire de nouveau stockage navigateur pour un objet métier.

## I/O & Edge-Case Matrix

| Scénario | Entrée / État | Comportement attendu | Gestion d'erreur |
|---|---|---|---|
| Migration au démarrage | N briefs locaux, jamais migrés | N templates créés (`instructions` seul, `private`), clé marquée migrée | Échec API → rien n'est marqué, briefs conservés, message non bloquant |
| Migration rejouée | Marqueur présent | Aucun appel réseau, aucun doublon | N/A |
| Migration partielle | 3 sur 5 créés puis échec | Les 3 restent, le marqueur n'est **pas** posé, la reprise ne recrée pas les 3 | Reprise par nom : un brief déjà migré est ignoré |
| Création | Nouveau template | `visibility: 'shared'` sans action de l'utilisateur | N/A |
| Passage en privé | Template `shared` d'un autre compte | 403 — seul le propriétaire ou un admin change le statut | Message explicite |
| Liste | Templates de l'équipe + les miens privés | Les `private` d'autrui sont absents ; les miens portent une marque | N/A |
| Catalogue | Onglet Templates | Une seule liste de départ ; aucune entrée en double | N/A |

</frozen-after-approval>

## Code Map

- `frontend/src/utils/localNamedTemplates.ts` -- `STORAGE_SCENE_KEY` à retirer ;
  `STORAGE_AUTHOR_KEY` **reste** (lot séparé).
- `frontend/src/components/generation/SystemPromptEditor.tsx` -- le repli « Briefs
  enregistrés » et le sélecteur « Templates de scène » disparaissent de l'onglet Brief.
- `frontend/src/components/generation/PresetSelector.tsx` -- seul point d'entrée des
  templates ; accueille la marque de statut et sa bascule.
- `api/schemas/template.py` -- champ `visibility`.
- `services/template_service.py` -- persistance du statut ; `services/template_sharing_service.py`
  -- `can_read` / `visibility` tiennent compte du statut.
- `config/prebuilt_templates.json` -- accueille les entrées manquantes ;
  `config/scene_instruction_templates.json` + `api/routers/config.py` (endpoint) à retirer.
- `frontend/src/api/config.ts`, `frontend/src/store/templateStore.ts` -- client à ajuster.

## Tasks & Acceptance

**Execution :**
- [ ] `api/schemas/template.py` + `services/template_service.py` -- champ `visibility`
  (`shared` par défaut), persisté dans le JSON ; défaut appliqué aux fichiers existants à la lecture.
- [ ] `services/template_sharing_service.py` -- `can_read` exclut les `private` d'autrui ;
  `can_write` réserve le changement de statut au propriétaire et à l'admin.
- [ ] `api/routers/templates.py` -- exposer et accepter `visibility` (POST, PUT).
- [ ] `config/prebuilt_templates.json` -- ajouter Conversation, Scène d'action, Moment intime ;
  supprimer `config/scene_instruction_templates.json` et son endpoint.
- [ ] `frontend/src/utils/migrateLocalBriefsToTemplates.ts` (nouveau) -- migration idempotente,
  reprise par nom, marqueur posé seulement en cas de succès complet.
- [ ] `frontend/src/utils/localNamedTemplates.ts` -- retirer l'API scène après migration.
- [ ] `SystemPromptEditor.tsx` -- retirer le repli et le sélecteur de scène.
- [ ] `PresetSelector.tsx` -- marque de statut sur chaque item + bascule privé/partagé.
- [ ] Tests -- migration (matrice complète), statut backend (pytest), affichage et bascule (Vitest).
- [ ] `e2e/templates-*.spec.ts` -- adapter ; ajouter un parcours « créer → partagé par défaut →
  passer en privé → invisible pour un autre compte ».

**Acceptance Criteria :**
- Étant donné des briefs locaux, quand j'ouvre l'app une première fois, alors je les retrouve
  dans Mes templates et le second démarrage n'en duplique aucun.
- Étant donné l'onglet Brief, quand je le parcours, alors aucune liste de briefs enregistrés n'y
  subsiste — les points de départ vivent uniquement dans Templates.
- Étant donné un template que je crée, quand je ne fais rien de plus, alors il est partagé.
- Étant donné un template que je passe en privé, quand un collègue liste les templates, alors il
  ne le voit pas.

## Design Notes

**Séquencement.** Ce lot est le premier des trois qui corrigent la PR #70, tous sur
`dev_epic_6` avant merge :

1. **(ce lot)** un objet serveur unique + statut `private`/`shared` + catalogue unifié ;
2. retrait du partage nominatif et du marketplace, que le statut remplace (~3 550 l.) ;
3. profil d'auteur porté sur le serveur, en objet distinct.

L'ordre compte : le statut doit exister et être éprouvé **avant** qu'on retire les mécanismes
qu'il remplace, sinon la branche traverse un état sans aucun modèle de visibilité.


Le lieu de stockage n'est pas une propriété métier. Ce qui distingue deux points de départ,
c'est **qui peut les voir** — d'où un champ, pas deux systèmes :

```
Template (serveur, JSON UUID)
  ownerId    : qui l'a créé
  visibility : shared (défaut) | private
```

La migration **copie** : les clés `localStorage` ne sont effacées qu'une fois les templates
créés et confirmés côté serveur. Un échec laisse l'utilisateur exactement où il était.

## Verification

**Commands :**
- `npm run test:backend:fast` -- expected : vert
- `cd frontend && npx tsc --noEmit && npm run lint` -- expected : 0
- `cd frontend && npx vitest run src/utils/ src/components/generation/ --reporter=dot`
- `npx playwright test e2e/templates-*.spec.ts --reporter=list --workers=1`

**Manual checks :**
- Poser deux briefs locaux, recharger : ils apparaissent dans Mes templates, marqués privés,
  et un second rechargement n'en crée pas d'autres.
