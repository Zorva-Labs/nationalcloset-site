-- Vendors / suppliers address book — the "other side" of contacts. Where
-- contacts are clients (people we sell to), vendors are who we BUY from:
-- installers, manufacturers, sales reps, suppliers, sub-contractors, etc.
-- Each vendor carries a role/title so the address book can be filtered by type.
CREATE TABLE IF NOT EXISTS vendors (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  name            TEXT NOT NULL,                       -- contact person OR company name
  company         TEXT,                                -- company, if "name" is a person
  role            TEXT,                                -- Installer | Manufacturer | Sales Rep | Supplier | Subcontractor | Other
  email           TEXT,
  phone           TEXT,
  website         TEXT,
  address_street  TEXT,
  address_city    TEXT,
  address_state   TEXT,
  address_zip     TEXT,
  notes           TEXT
);
CREATE INDEX IF NOT EXISTS idx_vendors_role    ON vendors(role);
CREATE INDEX IF NOT EXISTS idx_vendors_updated ON vendors(updated_at DESC);

-- Link bills to a vendor record (the free-text expenses.vendor stays as a label
-- fallback / for un-linked one-off payees).
ALTER TABLE expenses ADD COLUMN vendor_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_expenses_vendor ON expenses(vendor_id);
