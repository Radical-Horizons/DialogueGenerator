CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    actor_user_id TEXT,
    actor_username TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
ON audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id
ON audit_logs(actor_user_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action
ON audit_logs(action);
