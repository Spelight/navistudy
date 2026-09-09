PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS documents (
  user_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0,
  schema_version INTEGER NOT NULL,
  document_json TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS mutations (
  user_id TEXT NOT NULL,
  mutation_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  base_revision INTEGER NOT NULL,
  server_revision INTEGER NOT NULL,
  payload_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, mutation_id)
);

CREATE INDEX IF NOT EXISTS mutations_user_revision ON mutations(user_id, server_revision);

CREATE TABLE IF NOT EXISTS snapshots (
  user_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  schema_version INTEGER NOT NULL,
  document_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, revision)
);

