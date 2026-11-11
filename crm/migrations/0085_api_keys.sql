-- API keys for outside programs that post leads into the CRM through
-- /api/inbound/lead (functions/api/inbound/lead.js). Michael, 2026-11-11: leads
-- from GoHighLevel. One key per program, so each can be named, traced on its
-- leads (source_page = the key's source) and revoked on its own; the sister
-- site's /api/intake/lead keeps its own shared secret and is untouched.
-- Only the SHA-256 of a key is stored; the key itself is printed once by
-- tools/crm/api-key.mjs and never kept.
-- Apply: npx wrangler d1 execute nationalcloset-crm --remote --file=crm/migrations/0085_api_keys.sql
CREATE TABLE IF NOT EXISTS api_keys (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,             -- "GoHighLevel", shown in the lead alert
  source        TEXT NOT NULL,             -- leads.source_page for its leads, e.g. "ghl"
  brand         TEXT NOT NULL DEFAULT 'NCC',
  key_hash      TEXT NOT NULL UNIQUE,      -- hex SHA-256 of the whole key
  key_prefix    TEXT NOT NULL,             -- the first 12 characters, to tell keys apart
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at  TEXT,
  use_count     INTEGER NOT NULL DEFAULT 0,
  revoked_at    TEXT
);
