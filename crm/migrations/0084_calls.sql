-- Phone calls from CallRail (Terry McCarthy's phone menu, 2026-11-04). One row
-- per call, written by functions/api/callrail.js the moment CallRail's webhook
-- arrives, before anything else happens. A call gets its own table because a
-- caller rarely gives the name and email a lead carries.
--
-- menu_choice comes from the Tag step on each menu branch ("Menu - Estimate",
-- "Menu - Service", "Menu - Message"): the webhook has no field for the key
-- pressed. It is NULL when the caller pressed nothing.
--
-- lead_id: NULL no lead, 0 one is being made by this webhook, otherwise the
-- lead. A press-1 caller gets one made for them; a known number links to the
-- lead it already has. raw keeps the payload as received.
--
-- Apply: npx wrangler d1 execute nationalcloset-crm --remote --file=crm/migrations/0084_calls.sql
CREATE TABLE IF NOT EXISTS calls (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  callrail_id     TEXT NOT NULL UNIQUE,        -- CAL…; a second webhook updates this row
  menu_choice     TEXT,                        -- estimate | service | message | NULL
  tags            TEXT,                        -- every CallRail tag, comma-separated
  tracking_number TEXT,                        -- the number the caller dialed
  caller_number   TEXT,
  caller_name     TEXT,                        -- caller id, when the carrier gives one
  caller_city     TEXT,
  caller_state    TEXT,
  source          TEXT,                        -- CallRail's source for the tracking number
  started_at      TEXT,
  duration        INTEGER,                     -- seconds
  answered        INTEGER,
  voicemail       INTEGER NOT NULL DEFAULT 0,
  spam            INTEGER NOT NULL DEFAULT 0,
  recording_url   TEXT,
  lead_id         INTEGER,
  contact_id      INTEGER,
  notified        INTEGER NOT NULL DEFAULT 0,  -- 0 not sent, 2 being sent, 1 sent to STAFF_EMAIL
  notify_error    TEXT,
  raw             TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_calls_started ON calls (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_lead    ON calls (lead_id);
