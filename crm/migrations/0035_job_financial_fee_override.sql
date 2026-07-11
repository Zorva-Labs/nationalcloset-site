-- Manual processing-fee override per job. When fee_auto=0, fee_cents is used
-- verbatim (e.g. the small actual ACH fee) instead of the actual-Stripe-or-3%
-- estimate. NULL fee_cents with fee_auto=1 keeps the automatic behavior.
ALTER TABLE job_financials ADD COLUMN fee_cents INTEGER;
ALTER TABLE job_financials ADD COLUMN fee_auto  INTEGER NOT NULL DEFAULT 1;
