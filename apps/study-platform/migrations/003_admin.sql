PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS service_permissions (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service TEXT NOT NULL CHECK (service IN ('words', 'mt', 'reading', 'plan', 'tools')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  unrestricted INTEGER NOT NULL DEFAULT 0 CHECK (unrestricted IN (0, 1)),
  updated_at INTEGER NOT NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY(user_id, service)
);

CREATE TABLE IF NOT EXISTS session_observations (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  first_ip TEXT NOT NULL,
  last_ip TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS service_permissions_service ON service_permissions(service, enabled);
CREATE INDEX IF NOT EXISTS session_observations_last_seen ON session_observations(last_seen_at);
CREATE INDEX IF NOT EXISTS audit_log_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS audit_log_user_created ON audit_log(user_id, created_at);
