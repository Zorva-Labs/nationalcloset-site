-- Revenue breakdown of the all-inclusive gross (informational) + a manual
-- manufacturer discount that reduces the materials expense. Part of the itemized
-- job financials layout (Charged vs Expense per category).
ALTER TABLE job_financials ADD COLUMN materials_charged_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE job_financials ADD COLUMN accessories_charged_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE job_financials ADD COLUMN wall_charged_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE job_financials ADD COLUMN manufacturer_discount_cents INTEGER NOT NULL DEFAULT 0;
