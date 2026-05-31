-- Add product_id column to proposal_tier_lines and contract_lines so we can
-- trace lines back to the catalog they came from. width_in/height_in already
-- exist on both tables (added by an earlier migration cycle).

ALTER TABLE proposal_tier_lines ADD COLUMN product_id INTEGER REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE contract_lines ADD COLUMN product_id INTEGER REFERENCES products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tier_lines_product ON proposal_tier_lines(product_id);
CREATE INDEX IF NOT EXISTS idx_contract_lines_product ON contract_lines(product_id);
