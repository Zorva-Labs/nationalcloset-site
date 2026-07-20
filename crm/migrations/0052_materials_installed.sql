-- Fifth materials state: "Installed". Set automatically rather than by hand —
-- advance-jobs.js stamps it on the install date (same daily cron, same Central
-- -5h boundary it already uses to flip scheduled_install -> installing), and
-- the job PATCH stamps it if someone marks a job installing/completed sooner.
ALTER TABLE projects ADD COLUMN materials_installed_at TEXT;

-- Backfill. Two groups, both consistent with the going-forward rule:
--   1. completed jobs (asked for explicitly)
--   2. any job whose install_date has already passed — those would have been
--      stamped by the cron had the column existed, so this keeps history honest
--      instead of leaving a gap only new jobs fill.
-- Prefer the real install_date (noon, so it reads as that day in any timezone);
-- fall back to updated_at for a completed job that never got a date.
UPDATE projects
   SET materials_installed_at = COALESCE(install_date || ' 12:00:00', updated_at, datetime('now'))
 WHERE materials_installed_at IS NULL
   AND (status = 'completed'
        OR (install_date IS NOT NULL AND install_date <= date('now','-5 hours')));
