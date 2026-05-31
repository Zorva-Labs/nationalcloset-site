-- Scheduled installation date for a booked job.
-- A project advances Booked (contracted) → Scheduled (scheduled_install) when
-- the admin picks an install_date, then auto-advances to Installing on that
-- date (see functions/api/internal/advance-jobs.js, run by the cron worker).
ALTER TABLE projects ADD COLUMN install_date TEXT;
