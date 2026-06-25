-- Per-job cost breakdown + profit (for P&L and gross-income reports).
-- Expenses auto-derive from the client price via the cost model, but each line
-- can be overridden (the *_auto flag = 1 means "use the formula", 0 = manual).
CREATE TABLE IF NOT EXISTS job_financials (
  project_id      INTEGER PRIMARY KEY,
  price_cents     INTEGER NOT NULL DEFAULT 0,   -- client (all-inclusive) price
  discount_pct    REAL    NOT NULL DEFAULT 0,   -- tier discount used in the calc
  materials_cents INTEGER NOT NULL DEFAULT 0,
  shipping_cents  INTEGER NOT NULL DEFAULT 0,
  tax_cents       INTEGER NOT NULL DEFAULT 0,
  labor_cents     INTEGER NOT NULL DEFAULT 0,
  misc_cents      INTEGER NOT NULL DEFAULT 0,
  price_auto      INTEGER NOT NULL DEFAULT 1,   -- 1 = inherit contract/proposal total
  materials_auto  INTEGER NOT NULL DEFAULT 1,
  shipping_auto   INTEGER NOT NULL DEFAULT 1,
  tax_auto        INTEGER NOT NULL DEFAULT 1,
  labor_auto      INTEGER NOT NULL DEFAULT 1,
  notes           TEXT,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
