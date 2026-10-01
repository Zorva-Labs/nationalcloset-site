-- Contact-form submissions the spam checks dropped (non-US, honeypot, too
-- fast, Turnstile rejected). Kept apart from `leads` so the reports never
-- count them, and kept at all so a real person caught by a check is never
-- lost without a trace: the reason is on the row. Not emailed.
CREATE TABLE IF NOT EXISTS lead_drops (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reason     TEXT,
  name TEXT, email TEXT, phone TEXT, message TEXT, page TEXT, country TEXT,
  hp_ms TEXT, ua TEXT
);
