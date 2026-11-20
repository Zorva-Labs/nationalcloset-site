-- 2026-11-20 — Metricool in the CRM (Michael: "include … metricool").
--
-- Metricool holds the Business Profile, Facebook and Instagram numbers and the
-- posts scheduled through it. Like Gusto, it is read on this Mac (the Metricool
-- connector in the daily CRM sync task) and written here by
-- tools/crm/metricool.mjs; /crm/social only reads these tables. Nothing here
-- posts or changes anything in Metricool.
--
-- Apply:
--   set -a; . ~/.env; set +a; unset CLOUDFLARE_API_KEY CLOUDFLARE_EMAIL
--   npx wrangler d1 execute nationalcloset-crm --remote --file=crm/migrations/0091_metricool.sql

-- One value per day per Metricool field id (GMEV22 = Business Profile call clicks, …).
CREATE TABLE IF NOT EXISTS metricool_daily (
  day       TEXT NOT NULL,          -- YYYY-MM-DD
  field_id  TEXT NOT NULL,
  value     REAL,
  synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (day, field_id)
);

-- Posts scheduled or published through Metricool, one row per post and network.
CREATE TABLE IF NOT EXISTS metricool_posts (
  id          TEXT PRIMARY KEY,     -- <metricool post id>:<network>
  network     TEXT NOT NULL,
  status      TEXT,                 -- PUBLISHED | PENDING | ERROR | DRAFT | …
  publish_at  TEXT,                 -- Central wall clock, as Metricool gives it
  text        TEXT,
  url         TEXT,
  media_url   TEXT,
  synced_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_metricool_posts_at ON metricool_posts(publish_at);

-- The brand as of the last sync: which networks are connected.
CREATE TABLE IF NOT EXISTS metricool_brand (
  id        INTEGER PRIMARY KEY CHECK (id = 1),
  blog_id   TEXT,
  label     TEXT,
  networks  TEXT,                   -- JSON: {"facebook": "…", "gmb": "…", …}
  synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS metricool_sync (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ran_at  TEXT NOT NULL DEFAULT (datetime('now')),
  summary TEXT
);
