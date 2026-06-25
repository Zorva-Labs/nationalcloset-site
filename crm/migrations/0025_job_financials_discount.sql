-- Discounts come out of profit only: the cost basis stays on the pre-discount
-- (gross) price, the client pays net = gross - discount, profit = net - expenses.
-- discount_cents defaults from the accepted proposal's discount line(s); the
-- owner can override it per job (discount_auto = 0).
ALTER TABLE job_financials ADD COLUMN discount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE job_financials ADD COLUMN discount_auto  INTEGER NOT NULL DEFAULT 1;
