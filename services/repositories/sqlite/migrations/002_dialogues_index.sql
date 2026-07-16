CREATE TABLE IF NOT EXISTS dialogues_index (
    document_id TEXT PRIMARY KEY,
    owner_id TEXT,
    storage_path TEXT NOT NULL UNIQUE,
    last_modified_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (last_modified_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_dialogues_index_owner_id
ON dialogues_index(owner_id);
