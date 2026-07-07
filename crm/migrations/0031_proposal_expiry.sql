-- Proposals expire 2 days after they're sent — material, shipping & labor costs
-- move week to week, so we only guarantee pricing for a short window. The
-- valid_until column already exists (set to sent_at + 2 days in the send
-- endpoint). This adds the guard column so the automated "expires tomorrow"
-- reminder is emailed at most once per proposal (re-armed on every resend).
ALTER TABLE proposals ADD COLUMN expiry_reminder_sent_at TEXT;
