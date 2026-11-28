-- Each team member's own calendar subscription link (Michael, 2026-11-27:
-- "generate a calendar link for each sales person to be able to subscribe to
-- their own consults. They should only see their consults and the client info
-- for that consult"). /api/public/calendar/<token>.ics serves only the
-- consultations that person is assigned to. Made on first ask (Team → Calendar
-- link, or Calendar → Sync to phone); a new one replaces it if it leaks.
-- Apply: npx wrangler d1 execute nationalcloset-crm --remote --file=crm/migrations/0096_team_calendar_token.sql
ALTER TABLE team_members ADD COLUMN calendar_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_calendar_token ON team_members(calendar_token);
