-- Server-side pageview log for blocker-proof channel attribution.
-- Records only public-page ENTRIES (external/empty referrer or utm/gclid),
-- captured in the edge middleware — immune to ad blockers and GA filters.
CREATE TABLE IF NOT EXISTS pageviews (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  path          TEXT,
  channel       TEXT,          -- Google Ads / Google (organic) / Facebook/Instagram / AI search / Direct / <referrer host>
  referrer_host TEXT,
  utm_source    TEXT,
  utm_medium    TEXT,
  gclid         INTEGER DEFAULT 0,
  country       TEXT
);
CREATE INDEX IF NOT EXISTS idx_pageviews_created ON pageviews(created_at);
CREATE INDEX IF NOT EXISTS idx_pageviews_channel ON pageviews(channel);
