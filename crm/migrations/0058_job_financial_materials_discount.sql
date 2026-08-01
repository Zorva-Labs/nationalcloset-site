-- Manufacturer materials discount: a 3% discount off just the materials cost.
-- Simple on/off flag per job (0 = none, 1 = apply 3% off materials). When on,
-- resolveFinancials multiplies the effective materials cost by (1 - 0.03),
-- lowering cost and raising profit. Actual Stripe fees / other overrides
-- are unaffected.
ALTER TABLE job_financials ADD COLUMN materials_discount INTEGER NOT NULL DEFAULT 0;
