PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  username_key TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  recovery_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending_delete')),
  deletion_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  device_name TEXT NOT NULL,
  client_id TEXT NOT NULL,
  scopes TEXT NOT NULL,
  refresh_hash TEXT,
  refresh_expires_at INTEGER,
  csrf_token TEXT NOT NULL,
  sso_hash TEXT,
  sso_expires_at INTEGER,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  revoked_at INTEGER,
  UNIQUE(user_id, device_id, client_id)
);

CREATE INDEX IF NOT EXISTS sessions_user_active ON sessions(user_id, revoked_at, last_used_at);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_refresh_hash ON sessions(refresh_hash);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_sso_hash ON sessions(sso_hash);

CREATE TABLE IF NOT EXISTS access_tokens (
  token_hash TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scopes TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE INDEX IF NOT EXISTS access_tokens_user ON access_tokens(user_id, expires_at);

CREATE TABLE IF NOT EXISTS used_refresh_tokens (
  token_hash TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  used_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_codes (
  code_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  scopes TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE TABLE IF NOT EXISTS legacy_claims (
  username_key TEXT NOT NULL,
  product TEXT NOT NULL CHECK (product IN ('words', 'mt')),
  username TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  imported_at INTEGER NOT NULL,
  claimed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  claimed_at INTEGER,
  read_until INTEGER NOT NULL,
  PRIMARY KEY(username_key, product)
);

CREATE TABLE IF NOT EXISTS login_attempts (
  bucket TEXT PRIMARY KEY,
  failures INTEGER NOT NULL,
  first_at INTEGER NOT NULL,
  blocked_until INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  user_id TEXT,
  event TEXT NOT NULL,
  ip_prefix TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
