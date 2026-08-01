-- Wall repair / paint as a separate add-on line (Option 2: we finish + paint the
-- walls). The closet job keeps the existing formula; the wall line is a simple
-- total (what we charge) minus expense (what it costs us) = profit to us.
-- Grand total the client pays = closet net + wall_total. Both default 0, so a
-- job without wall work is unaffected.
ALTER TABLE job_financials ADD COLUMN wall_total_cents   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE job_financials ADD COLUMN wall_expense_cents INTEGER NOT NULL DEFAULT 0;
