# -*- coding: utf-8 -*-
path = 'graph-node-accept-reject.spec.ts'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()
out = []
i = 0
while i < len(lines):
    line = lines[i]
    if 'OPENAI_API_KEY (.env (ou' in line and i + 3 < len(lines):
        out.append(" * OPENAI_API_KEY (.env ou variables d'environnement), budget utilisable, modèle gpt-5-mini (panneau ou app_config.json). En cas d'échec : docs/troubleshooting/e2e-llm.md.\n")
        i += 4  # skip next 3 lines
        continue
    out.append(line)
    i += 1
with open(path, 'w', encoding='utf-8') as f:
    f.writelines(out)
print('Done')
