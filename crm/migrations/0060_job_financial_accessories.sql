-- Accessories expense line on a job's financials. A manual dollar amount
-- (default $0) that comes out of the gross quote, separate from materials and
-- wall repair. Part of the move to manual line-item entry (only install labor
-- stays auto-calculated).
ALTER TABLE job_financials ADD COLUMN accessories_cents INTEGER NOT NULL DEFAULT 0;
