-- Line items + notes/due date so invoices can be edited and printed as real invoices.
CREATE TABLE IF NOT EXISTS invoice_lines (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id  INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL DEFAULT '',
  qty         REAL NOT NULL DEFAULT 1,
  unit_cents  INTEGER NOT NULL DEFAULT 0,
  position    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_inv ON invoice_lines(invoice_id);
ALTER TABLE invoices ADD COLUMN notes TEXT;
ALTER TABLE invoices ADD COLUMN due_date TEXT;
