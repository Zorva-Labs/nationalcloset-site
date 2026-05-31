-- Stripe-backed invoices for deposits + balances on proposals and jobs.
-- Each invoice maps to one Stripe PaymentIntent; the customer pays via an
-- on-site card form (Stripe Elements) at /invoice/?t=<view_token>. The Stripe
-- webhook (payment_intent.succeeded) is the source of truth for "paid".
CREATE TABLE IF NOT EXISTS invoices (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  number        TEXT NOT NULL,
  project_id    INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  contact_id    INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  proposal_id   INTEGER,
  contract_id   INTEGER,
  type          TEXT NOT NULL DEFAULT 'custom',   -- deposit | balance | full | custom
  description   TEXT,
  amount_cents  INTEGER NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'usd',
  status        TEXT NOT NULL DEFAULT 'open',      -- draft | open | paid | void
  view_token    TEXT NOT NULL,
  stripe_payment_intent_id TEXT,
  paid_at       TEXT,
  paid_method   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  author_user_id INTEGER
);
CREATE INDEX IF NOT EXISTS idx_invoices_project ON invoices(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_token ON invoices(view_token);
CREATE INDEX IF NOT EXISTS idx_invoices_pi ON invoices(stripe_payment_intent_id);
