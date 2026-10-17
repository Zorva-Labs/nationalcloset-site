-- 2026-10-17 — the day-before and morning-of notices, one row per send.
--
-- Every scheduled visit now gets two customer reminders and two crew briefs:
-- the day before (9am–8pm Central) and the morning of (7am Central). One stamp
-- column per notice on appointments would have been four columns there and more
-- on projects, and a reschedule would have had to remember to clear them. Here a
-- notice is keyed on the start time it was for: move the visit and the old rows
-- no longer match, so the new time gets fresh reminders with nothing to reset.
--
-- The sweeps INSERT OR IGNORE first and send only when the insert took (stamp
-- first, as before), so the 3-minute cron can never send one twice.
-- appointments.reminder_sent_at and team_brief_sent_at are superseded; they
-- keep their history and nothing reads them any more.
--
-- Apply: set -a; . ~/.env; set +a; unset CLOUDFLARE_API_KEY CLOUDFLARE_EMAIL
--   npx wrangler d1 execute nationalcloset-crm --remote --file=crm/migrations/0074_event_notices.sql

CREATE TABLE IF NOT EXISTS event_notices (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,            -- 'appointment' | 'project' (an install date)
  entity_id   INTEGER NOT NULL,
  notice      TEXT NOT NULL,            -- client_eve | client_morning | crew_eve | crew_morning
  event_at    TEXT NOT NULL,            -- the start_at (or install_date) this notice was for
  outcome     TEXT,                     -- sent | failed | skipped:<why>; NULL while sending
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (entity_type, entity_id, notice, event_at)
);

-- The morning-of sends that already went out under the old stamp columns, so a
-- deploy on the morning of a visit cannot send its reminder or brief again.
INSERT OR IGNORE INTO event_notices (entity_type, entity_id, notice, event_at, outcome, created_at)
  SELECT 'appointment', id, 'client_morning', start_at, 'sent', reminder_sent_at
    FROM appointments WHERE reminder_sent_at IS NOT NULL AND start_at IS NOT NULL;
INSERT OR IGNORE INTO event_notices (entity_type, entity_id, notice, event_at, outcome, created_at)
  SELECT 'appointment', id, 'crew_morning', start_at, 'sent', team_brief_sent_at
    FROM appointments WHERE team_brief_sent_at IS NOT NULL AND start_at IS NOT NULL;
