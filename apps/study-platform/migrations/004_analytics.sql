PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  product TEXT NOT NULL CHECK (product IN ('study', 'words', 'mt', 'reading', 'plan', 'tools')),
  platform TEXT NOT NULL CHECK (platform IN ('web', 'wechat')),
  event_name TEXT NOT NULL,
  user_id TEXT,
  visitor_hash TEXT,
  item_key TEXT,
  value_number INTEGER,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  occurred_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS analytics_events_time ON analytics_events(occurred_at);
CREATE INDEX IF NOT EXISTS analytics_events_product_time ON analytics_events(product, occurred_at);
CREATE INDEX IF NOT EXISTS analytics_events_name_time ON analytics_events(event_name, occurred_at);
CREATE INDEX IF NOT EXISTS analytics_events_user_time ON analytics_events(user_id, occurred_at);
CREATE INDEX IF NOT EXISTS analytics_events_item ON analytics_events(product, event_name, item_key);

CREATE TABLE IF NOT EXISTS analytics_favorites (
  product TEXT NOT NULL CHECK (product IN ('words', 'mt', 'reading')),
  item_key TEXT NOT NULL,
  actor_key TEXT NOT NULL,
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(product, item_key, actor_key)
);

CREATE INDEX IF NOT EXISTS analytics_favorites_active ON analytics_favorites(product, item_key, active);
