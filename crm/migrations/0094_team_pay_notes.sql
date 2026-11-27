-- How a team member is paid (rate, commission), written by an admin on /crm/team.
-- Free text, admin-only: /api/team returns it only to an admin login, because
-- sales logins read the roster for the assignee pickers. Michael, 2026-11-27.
ALTER TABLE team_members ADD COLUMN pay_notes TEXT;
