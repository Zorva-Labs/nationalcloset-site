-- 2026-10-17 — "Painter booked" on a job.
--
-- Option 2 of a proposal (contract_type 'wallprep') is the closet plus wall
-- repair and paint, so a job booked on it needs the painter booked. The CRM
-- flags such a job until someone ticks "Painter booked" on it; this is the
-- tick, stamped like the materials steps (NULL = not booked yet).
ALTER TABLE projects ADD COLUMN painter_booked_at TEXT;
