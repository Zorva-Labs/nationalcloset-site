-- Pay-in-full is chosen on the PROPOSAL (per James: option 1). It copies onto
-- the contract when the contract is created, so the terms + invoices follow it.
ALTER TABLE proposals ADD COLUMN payment_plan TEXT NOT NULL DEFAULT 'installments';
