ALTER TABLE template_shares ADD COLUMN can_edit INTEGER NOT NULL DEFAULT 0;

ALTER TABLE shared_templates ADD COLUMN is_anonymous INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shared_templates ADD COLUMN is_official INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS template_marketplace_comments (
    id TEXT PRIMARY KEY,
    listing_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (listing_id) REFERENCES shared_templates(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_template_marketplace_comments_listing
ON template_marketplace_comments(listing_id, created_at);

CREATE TABLE IF NOT EXISTS template_suggestion_context_usage (
    user_id TEXT NOT NULL,
    source TEXT NOT NULL,
    candidate_id TEXT NOT NULL,
    context_key TEXT NOT NULL,
    use_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, source, candidate_id, context_key)
);
