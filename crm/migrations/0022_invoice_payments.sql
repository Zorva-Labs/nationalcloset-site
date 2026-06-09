-- Partial-payment support: track how much of an invoice has been paid, plus a
-- ledger of each payment (esp. in-person cash/check/card-on-reader payments).
ALTER TABLE invoices ADD COLUMN amount_paid_cents INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS invoice_payments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id   INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  method       TEXT,            -- "Cash", "Check · 1234", "card", "us_bank_account"…
  note         TEXT,
  paid_at      TEXT NOT NULL DEFAULT (datetime('now')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_inv ON invoice_payments(invoice_id);

-- Backfill: invoices already marked paid are fully paid.
UPDATE invoices SET amount_paid_cents = amount_cents WHERE status = 'paid';
