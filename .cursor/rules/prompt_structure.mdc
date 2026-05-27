---
description: Parsing et affichage du prompt structuré — sections imbriquées, hiérarchie, tests
globs:
  - "frontend/src/hooks/usePromptPreview.ts"
  - "frontend/src/hooks/usePromptPreview.test.ts"
  - "frontend/src/components/generation/StructuredPromptView.tsx"
alwaysApply: false
---

- **Parsing** : `usePromptPreview.ts::parsePromptSections()` parse le prompt en sections hiérarchiques (### SECTION X → --- TITRE ---).
- **Structure** : Sections principales (### SECTION X), catégories (--- CHARACTERS ---), sections d'éléments (--- IDENTITÉ ---), éléments individuels (CHARACTER 1, CHARACTER 2).
- **Règles de parsing** :
  - Regex header section : `/^(?:--- (.+?) ---|### (SECTION \d+[A-Z]?\. .+?))(\s*\n+)/m` (capture le saut de ligne explicitement).
  - Si un seul élément dans une catégorie → sections directement dans `children` (pas de wrapper "CHARACTER 1").
  - Si plusieurs éléments → wrappers "CHARACTER 1", "CHARACTER 2" avec sections imbriquées.
  - Contenu avant sections `---` → `remainingContent`, sections `---` → `children`.
- **Tests** : `frontend/src/hooks/usePromptPreview.test.ts` (8 tests couvrant cas normaux, cas limites, sections imbriquées).
- **Debug** : Utiliser `console.log` dans les tests existants, pas de fichiers temporaires. Utiliser `it.only` ou `describe.only` pour isoler un test.
- **Problèmes courants** : Si contenu tronqué → vérifier que le regex capture bien le saut de ligne après le header. Si sections non détectées → vérifier format `--- TITRE ---` (début de ligne).
