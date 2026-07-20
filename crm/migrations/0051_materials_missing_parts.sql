-- Fourth materials state: "Missing parts". Same shape as the other three —
-- stores the timestamp the box was checked (NULL = unchecked) — so the job
-- screen, the jobs list and the install worksheet all read it the same way.
--
-- Distinct from materials_damaged_at on purpose: damaged means it arrived
-- broken, missing means it never showed up. Different supplier conversation,
-- and the crew needs to know which one before they load the truck.
ALTER TABLE projects ADD COLUMN materials_missing_at TEXT;
