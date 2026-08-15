-- Morning-of consultation reminder: guard so the cron sends it once per appointment.
ALTER TABLE appointments ADD COLUMN reminder_sent_at TEXT;
