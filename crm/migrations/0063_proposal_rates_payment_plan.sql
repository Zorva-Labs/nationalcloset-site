-- (A) Persist the proposal's internal cost-rate bar (materials divisor, labor,
--     etc.) so the profit preview sticks instead of resetting to the 2.10 default.
ALTER TABLE proposals ADD COLUMN cost_rates TEXT;   -- JSON: {divisor,shipRate,taxRate,laborRate,matDiscRate,feeRate}

-- (B) Pay-in-full option, chosen on the contract/job: 'installments' (50/25/25,
--     the default) or 'full' (one 100% invoice at signing, no milestones).
ALTER TABLE contracts ADD COLUMN payment_plan TEXT NOT NULL DEFAULT 'installments';
