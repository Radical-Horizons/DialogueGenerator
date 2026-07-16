CREATE TABLE dialogues_index_with_foreign_keys (
    document_id TEXT PRIMARY KEY,
    owner_id TEXT,
    storage_path TEXT NOT NULL UNIQUE,
    last_modified_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (last_modified_by) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO dialogues_index_with_foreign_keys(
    document_id,
    owner_id,
    storage_path,
    last_modified_by,
    created_at,
    updated_at
)
SELECT
    document_id,
    CASE WHEN owner_id IN (SELECT id FROM users) THEN owner_id ELSE NULL END,
    storage_path,
    CASE WHEN last_modified_by IN (SELECT id FROM users) THEN last_modified_by ELSE NULL END,
    created_at,
    updated_at
FROM dialogues_index;

DROP TABLE dialogues_index;
ALTER TABLE dialogues_index_with_foreign_keys RENAME TO dialogues_index;

CREATE INDEX idx_dialogues_index_owner_id
ON dialogues_index(owner_id);
