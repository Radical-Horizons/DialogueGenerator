CREATE TABLE IF NOT EXISTS template_suggestion_usage (
    user_id TEXT NOT NULL,
    source TEXT NOT NULL,
    candidate_id TEXT NOT NULL,
    use_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, source, candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_template_suggestion_usage_user
ON template_suggestion_usage(user_id);
