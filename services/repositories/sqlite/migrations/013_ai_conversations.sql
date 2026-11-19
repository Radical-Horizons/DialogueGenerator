-- Conversations avec l'IA sur un sujet (premier sujet : le nœud de dialogue généré).
--
-- `seed_json` est l'instantané pris à la création (instructions, contexte exact, sortie,
-- résumé de réflexion) : une régénération du nœud ou la rotation des journaux d'usage ne
-- change pas une conversation existante. Une conversation est privée à son propriétaire.

CREATE TABLE IF NOT EXISTS ai_conversations (
    id TEXT NOT NULL PRIMARY KEY,
    owner_id TEXT NOT NULL,
    subject_kind TEXT NOT NULL,
    subject_key TEXT NOT NULL,
    subject_json TEXT NOT NULL,
    title TEXT NOT NULL,
    model_name TEXT NOT NULL,
    seed_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_owner_updated
ON ai_conversations(owner_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_owner_subject
ON ai_conversations(owner_id, subject_key);

CREATE TABLE IF NOT EXISTS ai_conversation_messages (
    id TEXT NOT NULL PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    reasoning_summary TEXT,
    llm_call_id TEXT,
    model_name TEXT,
    cost_usd REAL,
    created_at TEXT NOT NULL,
    UNIQUE (conversation_id, position),
    FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
);
