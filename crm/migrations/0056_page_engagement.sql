-- Time-on-page samples from the first-party engagement beacon (js/main.js →
-- /api/pv-time). Blocker-resistant (same-origin) measure of how long visitors
-- actually stay. One row per page visibility segment.
CREATE TABLE IF NOT EXISTS page_engagement (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  path       TEXT,
  seconds    INTEGER,
  country    TEXT
);
CREATE INDEX IF NOT EXISTS idx_pe_created ON page_engagement(created_at);
CREATE INDEX IF NOT EXISTS idx_pe_path ON page_engagement(path);
