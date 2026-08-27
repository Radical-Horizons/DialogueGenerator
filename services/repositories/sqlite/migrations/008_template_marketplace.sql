CREATE TABLE IF NOT EXISTS shared_templates (
    id TEXT PRIMARY KEY,
    source_template_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    snapshot TEXT NOT NULL,
    usage_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (source_template_id, author_id),
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shared_templates_author_id
ON shared_templates(author_id);

CREATE TABLE IF NOT EXISTS template_ratings (
    listing_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    stars INTEGER NOT NULL CHECK (stars >= 1 AND stars <= 5),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (listing_id, user_id),
    FOREIGN KEY (listing_id) REFERENCES shared_templates(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
