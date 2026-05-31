-- Add color + options columns to every line table so spec details (white,
-- walnut, oil-rubbed bronze; inside mount, motorized, blackout liner, etc.)
-- are editable per line and survive the lifecycle.

ALTER TABLE proposal_tier_lines ADD COLUMN color   TEXT;
ALTER TABLE proposal_tier_lines ADD COLUMN options TEXT;
ALTER TABLE contract_lines      ADD COLUMN color   TEXT;
ALTER TABLE contract_lines      ADD COLUMN options TEXT;
ALTER TABLE estimate_lines      ADD COLUMN color   TEXT;
ALTER TABLE estimate_lines      ADD COLUMN options TEXT;
