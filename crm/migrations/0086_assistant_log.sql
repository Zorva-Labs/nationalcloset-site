-- The site assistant (site-kit assistant): every question asked through the
-- search / ask panel, the answer given, the pages it drew on, and any call-back
-- request it captured. Read by the daily caps in functions/api/ask.js (per
-- visitor and site-wide), by the /traffic dashboard and the monthly report —
-- and worth reading by hand: it is what customers want to know, in their words.
CREATE TABLE IF NOT EXISTS assistant_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  ip_hash    TEXT    NOT NULL,          -- sha256(ip + the UTC date): a day's limit, not a visitor's identity
  session    TEXT,                      -- the browser's random session id, so a thread reads in order
  page       TEXT,                      -- the page the question was asked from
  question   TEXT    NOT NULL,
  answer     TEXT,
  sources    TEXT,                      -- JSON: the pages the answer cited
  lead       TEXT,                      -- JSON: a call-back request the assistant captured (name, phone, email, need, city, timing)
  model      TEXT,
  in_tokens  INTEGER,                   -- input not read from or written to the cache
  cache_read INTEGER,                   -- tokens read from the cache: the rules and the fact sheet, at a tenth of the input price
  cache_write INTEGER,                  -- tokens written to it, at 1.25× (a first question after five quiet minutes)
  out_tokens INTEGER,
  ms         INTEGER,
  status     TEXT    NOT NULL DEFAULT 'ok'   -- ok | error | refused
);
CREATE INDEX IF NOT EXISTS idx_assistant_log_ip   ON assistant_log (ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assistant_log_when ON assistant_log (created_at DESC);
