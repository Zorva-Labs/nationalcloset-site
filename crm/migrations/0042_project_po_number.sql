-- Optional purchase-order number per job (for builder/commercial clients who
-- issue POs). Free-text; NULL when not applicable.
ALTER TABLE projects ADD COLUMN po_number TEXT;
