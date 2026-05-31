-- National Closet Company CRM — D1 schema
-- Apply via: wrangler d1 execute nationalcloset-crm --file=crm/schema.sql --remote
-- (or via the Cloudflare API /d1/database/{id}/query)

-- ----------------------------------------------------------------
-- Leads: one row per inbound consultation request
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leads (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),

  -- Contact info
  name            TEXT NOT NULL,
  phone           TEXT NOT NULL,
  email           TEXT NOT NULL,
  location        TEXT,                 -- City / ZIP from form

  -- Project info
  interest        TEXT,                 -- Product category they're considering
  message         TEXT,                 -- Free-text from form

  -- Source tracking (set from request headers / hidden form fields)
  source_page     TEXT NOT NULL DEFAULT 'home',
  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,
  utm_term        TEXT,
  utm_content     TEXT,
  referrer        TEXT,
  user_agent      TEXT,
  ip_hash         TEXT,                 -- SHA-256 of IP, no raw PII

  -- Pipeline
  status          TEXT NOT NULL DEFAULT 'new',  -- new | contacted | quoted | scheduled | installed | won | lost | spam
  assigned_to     TEXT,
  quoted_amount_cents INTEGER,

  archived_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_leads_status   ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created  ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_email    ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_archived ON leads(archived_at);

-- ----------------------------------------------------------------
-- Lead notes: follow-up history per lead
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lead_notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id     INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  author      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notes_lead ON lead_notes(lead_id, created_at DESC);

-- ----------------------------------------------------------------
-- Admin users (one or two people only)
-- Passwords stored as PBKDF2-SHA256, 100k iterations, 16-byte salt
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,       -- base64 PBKDF2 derived key
  password_salt   TEXT NOT NULL,       -- base64 salt
  display_name    TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at   TEXT
);

-- ----------------------------------------------------------------
-- Sessions: server-side session store, indexed by random token
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,        -- 32-byte random, base64url
  user_id     INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL,
  user_agent  TEXT,
  ip_hash     TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
