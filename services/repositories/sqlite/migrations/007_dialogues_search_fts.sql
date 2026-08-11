CREATE TABLE IF NOT EXISTS dialogues_search_meta (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    indexed_count INTEGER NOT NULL DEFAULT 0,
    last_rebuild_at TEXT,
    last_search_ms REAL,
    rebuild_status TEXT NOT NULL DEFAULT 'idle',
    rebuild_error TEXT,
    index_bytes INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO dialogues_search_meta(id) VALUES (1);

CREATE VIRTUAL TABLE IF NOT EXISTS dialogues_search_fts USING fts5(
    document_id UNINDEXED,
    title,
    speakers,
    body,
    tokenize = 'unicode61'
);
