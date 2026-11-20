-- 2026-11-20 — Gusto in the CRM: crew pay per job, and what Gusto says (Michael:
-- "build out everything you can").
--
-- National Closet Company runs no W-2 payroll after Nov 27, 2026. Every
-- contractor (installers, the sales rep, the manager) is paid per job once the
-- work is done, as a Gusto contractor payment. The CRM records each amount on the
-- job as a bill (category "Crew pay" or "Commission"), so Payables and Cash flow
-- carry it with no change to those reports. Gusto itself can only be reached from
-- this Mac (the connector), so tools/crm/gusto.mjs writes Gusto's side into the
-- tables below once a day and marks the bills paid when Gusto funds them.
--
-- Apply (before deploying the code that reads it):
--   set -a; . ~/.env; set +a; unset CLOUDFLARE_API_KEY CLOUDFLARE_EMAIL
--   npx wrangler d1 execute nationalcloset-crm --remote --file=crm/migrations/0090_gusto.sql

-- A bill can now belong to a person on the roster and to a Gusto record.
--   source:      NULL (typed on Expenses) | 'crew_pay' (the job's Crew pay card) | 'gusto' (found in Gusto by the sync)
--   gusto_status: for crew pay — 'owed' (entered), 'prepared' (a Gusto draft is waiting for submit), 'paid' (Gusto funded it)
--   gusto_ref:   the Gusto contractor payment or payroll uuid that paid it
ALTER TABLE expenses ADD COLUMN team_member_id INTEGER REFERENCES team_members(id);
ALTER TABLE expenses ADD COLUMN source TEXT;
ALTER TABLE expenses ADD COLUMN gusto_status TEXT;
ALTER TABLE expenses ADD COLUMN gusto_ref TEXT;
ALTER TABLE expenses ADD COLUMN prepared_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_gusto_ref ON expenses(gusto_ref) WHERE gusto_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_source ON expenses(source, gusto_status);

-- The roster ↔ Gusto contractor link.
ALTER TABLE team_members ADD COLUMN gusto_contractor_uuid TEXT;
UPDATE team_members SET gusto_contractor_uuid = 'aebb6c6f-7b75-41c2-be5e-4f9aaf859222' WHERE email = 'cornwellmike98@gmail.com';
UPDATE team_members SET gusto_contractor_uuid = '3562cc22-b7f3-457d-965d-0f6190be9331' WHERE email = 'riley@nationalclosetco.com';
UPDATE team_members SET gusto_contractor_uuid = '7c7de7a0-f0df-406d-9cd0-f7a0a85574dc' WHERE name = 'Michael Blair';

-- Gusto's side, as of the last sync. No tax ids, addresses or bank details:
-- only what the CRM shows.
CREATE TABLE IF NOT EXISTS gusto_contractors (
  uuid              TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  kind              TEXT,            -- Individual | Business
  department        TEXT,
  email             TEXT,
  start_date        TEXT,
  is_active         INTEGER NOT NULL DEFAULT 1,
  onboarded         INTEGER NOT NULL DEFAULT 0,
  onboarding_status TEXT,
  payment_method    TEXT,
  ytd_paid_cents    INTEGER NOT NULL DEFAULT 0,   -- this calendar year's funded payments (the 1099 figure)
  team_member_id    INTEGER,
  synced_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gusto_payments (
  uuid            TEXT PRIMARY KEY,
  contractor_uuid TEXT NOT NULL,
  pay_date        TEXT NOT NULL,
  status          TEXT,              -- Gusto's: Unfunded | Funded | ...
  wage_cents      INTEGER NOT NULL DEFAULT 0,
  bonus_cents     INTEGER NOT NULL DEFAULT 0,
  reimbursement_cents INTEGER NOT NULL DEFAULT 0,
  total_cents     INTEGER NOT NULL DEFAULT 0,
  payment_method  TEXT,
  expense_id      INTEGER,           -- the bill it paid
  synced_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gusto_payments_date ON gusto_payments(pay_date);

CREATE TABLE IF NOT EXISTS gusto_payrolls (
  uuid               TEXT PRIMARY KEY,
  period_start       TEXT,
  period_end         TEXT,
  check_date         TEXT,
  processed          INTEGER NOT NULL DEFAULT 0,
  processed_date     TEXT,
  off_cycle          INTEGER NOT NULL DEFAULT 0,
  gross_cents        INTEGER NOT NULL DEFAULT 0,
  net_cents          INTEGER NOT NULL DEFAULT 0,
  employer_tax_cents INTEGER NOT NULL DEFAULT 0,
  company_debit_cents INTEGER NOT NULL DEFAULT 0,
  expense_id         INTEGER,
  synced_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Gusto's to-do list (deadlines, filings, compliance), replaced on every sync.
CREATE TABLE IF NOT EXISTS gusto_tasks (
  id        TEXT PRIMARY KEY,
  category  TEXT,
  title     TEXT NOT NULL,
  message   TEXT,
  priority  TEXT,
  due_at    TEXT,
  deep_link TEXT,
  synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gusto_sync (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ran_at  TEXT NOT NULL DEFAULT (datetime('now')),
  summary TEXT
);
