-- Per-job materials tracking: order / receive / damage. Each column stores the
-- timestamp the box was checked (NULL = unchecked), so the job screen shows both
-- the checkbox state and when it happened.
ALTER TABLE projects ADD COLUMN materials_ordered_at  TEXT;
ALTER TABLE projects ADD COLUMN materials_received_at TEXT;
ALTER TABLE projects ADD COLUMN materials_damaged_at  TEXT;
