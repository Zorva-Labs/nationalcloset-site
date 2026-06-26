-- Bills / expenses the business owes or has paid to suppliers, subcontractors,
-- overhead, etc. Enables real Accounts Payable, A/P aging, and the cash-OUT side
-- of the cash-flow statement (cash-IN already comes from invoice_payments).
CREATE TABLE IF NOT EXISTS expenses (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor            TEXT,
  description       TEXT,
  category          TEXT,                              -- Materials, Subcontractor, Tools, Overhead, Other…
  project_id        INTEGER,                           -- optional link to a job
  amount_cents      INTEGER NOT NULL DEFAULT 0,        -- total bill
  amount_paid_cents INTEGER NOT NULL DEFAULT 0,        -- paid so far
  status            TEXT NOT NULL DEFAULT 'unpaid',    -- unpaid | paid | void
  bill_date         TEXT,                              -- date the bill was incurred
  due_date          TEXT,
  paid_at           TEXT,
  method            TEXT,
  notes             TEXT,
  created_by        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_expenses_status  ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_project ON expenses(project_id);

-- Individual payments against a bill (for partial payments + cash-flow timing).
CREATE TABLE IF NOT EXISTS expense_payments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_id  INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  method      TEXT,
  note        TEXT,
  paid_at     TEXT NOT NULL DEFAULT (datetime('now')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_expense_payments_exp ON expense_payments(expense_id);
