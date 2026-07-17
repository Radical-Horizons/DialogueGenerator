CREATE TABLE IF NOT EXISTS dialogue_shares (
    document_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    permission TEXT NOT NULL CHECK (permission = 'writer'),
    created_at TEXT NOT NULL,
    PRIMARY KEY (document_id, user_id),
    FOREIGN KEY (document_id) REFERENCES dialogues_index(document_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dialogue_shares_user_id
ON dialogue_shares(user_id);
