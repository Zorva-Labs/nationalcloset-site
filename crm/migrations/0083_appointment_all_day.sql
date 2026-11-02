-- Calendar event types (Michael, 2026-11-02): Vacation and Unavailable are
-- whole-day blocks that can run for several days. all_day = 1 means the event
-- covers every day from start_at's date through end_at's date (stored as
-- 00:00 on the first day and 23:59 on the last); the calendar shows it on each
-- of those days and the phone feed sends it as a date-only event.
-- The new types themselves need no migration: appointments.type is free text.
-- Apply: npx wrangler d1 execute nationalcloset-crm --remote --file=crm/migrations/0083_appointment_all_day.sql
ALTER TABLE appointments ADD COLUMN all_day INTEGER NOT NULL DEFAULT 0;
