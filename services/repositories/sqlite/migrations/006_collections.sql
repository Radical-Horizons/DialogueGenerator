CREATE TABLE IF NOT EXISTS collections (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    owner_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS collection_dialogues (
    collection_id TEXT NOT NULL,
    document_id TEXT NOT NULL,
    PRIMARY KEY (collection_id, document_id),
    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
    FOREIGN KEY (document_id) REFERENCES dialogues_index(document_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_collections_owner_id
ON collections(owner_id);

CREATE INDEX IF NOT EXISTS idx_collection_dialogues_document_id
ON collection_dialogues(document_id);
