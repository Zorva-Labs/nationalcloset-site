-- National Closet Company CRM — Full client lifecycle
-- Booking + Projects + Estimates + Proposals + Contracts + Signatures
-- Apply via: source ~/.env && CLOUDFLARE_API_KEY=$CLOUDFLARE_API_KEY CLOUDFLARE_EMAIL=$CLOUDFLARE_EMAIL \
--   npx wrangler@latest d1 execute nationalcloset-crm --remote --file=crm/migrations/0003_full_lifecycle.sql

-- ----------------------------------------------------------------
-- Contacts: promoted from leads, one row per person (deduped on email)
-- A contact has many leads (re-inquiries), many projects, many appointments
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contacts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  name            TEXT NOT NULL,
  email           TEXT UNIQUE NOT NULL,
  phone           TEXT,
  address_street  TEXT,
  address_city    TEXT,
  address_state   TEXT,
  address_zip     TEXT,
  notes           TEXT
);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_created ON contacts(created_at DESC);

-- Backfill: bring forward leads.email -> contacts (one row per unique email)
INSERT OR IGNORE INTO contacts (name, email, phone, address_street, address_city, address_state, address_zip)
SELECT name, email, phone,
       (SELECT address_street FROM leads l2 WHERE l2.email = leads.email AND l2.address_street IS NOT NULL LIMIT 1),
       (SELECT address_city FROM leads l2 WHERE l2.email = leads.email AND l2.address_city IS NOT NULL LIMIT 1),
       (SELECT address_state FROM leads l2 WHERE l2.email = leads.email AND l2.address_state IS NOT NULL LIMIT 1),
       (SELECT address_zip FROM leads l2 WHERE l2.email = leads.email AND l2.address_zip IS NOT NULL LIMIT 1)
FROM leads
WHERE email IS NOT NULL AND email != ''
GROUP BY email;

-- Link existing leads to their new contact rows
ALTER TABLE leads ADD COLUMN contact_id INTEGER REFERENCES contacts(id);
UPDATE leads SET contact_id = (SELECT id FROM contacts WHERE contacts.email = leads.email LIMIT 1)
WHERE contact_id IS NULL;

-- ----------------------------------------------------------------
-- Projects: a job for a contact (kitchen, full house, etc.)
-- A contact can have many projects over years
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id      INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,                    -- "Kitchen + Baths", "Full House Build", "Master Bedroom"
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'new',      -- new | scheduled | quoted | proposed | contracted | installing | completed | lost
  site_address    TEXT,                             -- if different from contact home
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_projects_contact ON projects(contact_id);
CREATE INDEX IF NOT EXISTS idx_projects_status  ON projects(status);

-- ----------------------------------------------------------------
-- Windows: spec sheet for a project. Captured during site visit.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS windows (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  room            TEXT NOT NULL,                    -- "Living Room", "Primary Bedroom"
  label           TEXT,                             -- "North", "South-East corner", "Bay - left panel"
  width_in        REAL,                             -- decimal inches
  height_in       REAL,
  mount           TEXT,                             -- inside | outside
  depth_in        REAL,                             -- for inside-mount
  notes           TEXT,                             -- "crank handle", "shutter must clear sash", etc.
  position        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_windows_project ON windows(project_id, position);

-- ----------------------------------------------------------------
-- Product catalog: priced product library used in estimates/proposals
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  sku             TEXT UNIQUE,
  name            TEXT NOT NULL,                    -- "Faux Wood 2.5\" White"
  category        TEXT NOT NULL,                    -- faux-wood | real-wood | cellular | sheer | plantation | etc.
  description     TEXT,
  unit            TEXT NOT NULL DEFAULT 'window',   -- window | sqft | panel | linear-ft
  base_price_cents INTEGER NOT NULL DEFAULT 0,      -- per unit
  -- Pricing formula for area-based products:
  -- price = base_price_cents + (price_per_sqft_cents * (width_in * height_in / 144))
  price_per_sqft_cents INTEGER NOT NULL DEFAULT 0,
  notes           TEXT,
  active          INTEGER NOT NULL DEFAULT 1,
  position        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category, position);
CREATE INDEX IF NOT EXISTS idx_products_active   ON products(active);

-- Seed: a starter catalog (admin will refine in /crm/products.html)
INSERT OR IGNORE INTO products (sku, name, category, unit, base_price_cents, price_per_sqft_cents, position) VALUES
  ('FW25-WHT',   'Faux Wood 2.5" — White (cordless)',                'faux-wood',   'window', 8900,   0,    1),
  ('FW20-WHT',   'Faux Wood 2.0" — White (cordless)',                'faux-wood',   'window', 7900,   0,    2),
  ('RW25-NAT',   'Real Wood Blind 2.5" — Stain (cordless)',          'real-wood',   'window', 18000,  0,    3),
  ('CELL-LF',    'Cellular Single Cell — Light Filter',              'cellular',    'window', 12000,  300,  4),
  ('CELL-BO',    'Cellular Double Cell — Blackout (LightLock)',      'cellular',    'window', 22000,  500,  5),
  ('CELL-TD',    'Cellular — Top-Down/Bottom-Up upgrade',            'cellular',    'window', 4000,   0,    6),
  ('ROLL-LF',    'Roller Shade — Light Filter',                      'roller',      'window', 12000,  250,  7),
  ('ROLL-BO',    'Roller Shade — Blackout',                          'roller',      'window', 16000,  300,  8),
  ('SOL-3',      'Solar Shade — 3% Openness',                        'solar',       'window', 16000,  300,  9),
  ('ZEB-STD',    'Zebra/Banded Dual-Layer Shade',                    'zebra',       'window', 18000,  350,  10),
  ('WW-PROV',    'Woven Wood — Hunter Douglas Provenance',           'woven-wood',  'window', 26000,  500,  11),
  ('VIG-MOD',    'Hunter Douglas Vignette Modern Roman',             'roman',       'window', 42000,  600,  12),
  ('ROMAN-STD',  'Custom Roman Shade — Flat',                        'roman',       'window', 28000,  400,  13),
  ('SIL-25',     'Hunter Douglas Silhouette 2.5" Vane',              'sheer',       'window', 48000,  900,  14),
  ('PIR-STD',    'Hunter Douglas Pirouette',                         'sheer',       'window', 52000,  900,  15),
  ('LUM-STD',    'Hunter Douglas Luminette Privacy Sheer',           'sheer',       'panel',  120000, 0,    16),
  ('PS-COMP',    'Plantation Shutter — Composite (Woodlore)',        'plantation',  'window', 35000,  400,  17),
  ('PS-BASS',    'Plantation Shutter — Basswood (Heritance)',        'plantation',  'window', 70000,  800,  18),
  ('PS-MOTOR',   'Plantation Shutter — Motorized Tilt upgrade',      'plantation',  'window', 30000,  0,    19),
  ('DRP-PANEL',  'Custom Drapery Panel — Lined',                     'drapery',     'panel',  68000,  0,    20),
  ('DRP-SHEER',  'Sheer Drapery Panel',                              'drapery',     'panel',  42000,  0,    21),
  ('MOT-ROLL',   'Motorization Upgrade — Roller (Somfy/PowerView)',  'motor',       'window', 22000,  0,    22),
  ('MOT-CELL',   'Motorization Upgrade — Cellular',                  'motor',       'window', 24000,  0,    23),
  ('MOT-HUB',    'Smart-Home Hub (PowerView or TaHoma)',             'motor',       'window', 20000,  0,    24),
  ('OUT-SOLAR',  'Exterior Solar Shade — motorized',                 'outdoor',     'window', 240000, 0,    25),
  ('OUT-SCREEN', 'Phantom Retractable Insect Screen',                'outdoor',     'panel',  180000, 0,    26),
  ('INST-STD',   'Install Only — Standard blind/shade',              'install',     'window', 5500,   0,    27),
  ('INST-SHUT',  'Install Only — Plantation shutter',                'install',     'window', 9500,   0,    28),
  ('INST-MOTOR', 'Install Only — Motorized w/ programming',          'install',     'window', 13500,  0,    29),
  ('INST-MIN',   'Install Service-Call Minimum (3 windows or fewer)','install',     'flat',   18500,  0,    30),
  ('REP-STD',    'Repair — Cord/Tilt-Rod/Slat (standard)',           'repair',      'window', 7500,   0,    31),
  ('REP-MOTOR',  'Repair — PowerView/Somfy motor service',           'repair',      'window', 22000,  0,    32),
  ('REP-MIN',    'Repair Service-Call Minimum',                      'repair',      'flat',   9500,   0,    33);

-- ----------------------------------------------------------------
-- Availability: weekly recurring rules (Mon-Sun, multi-window per day)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS availability_rules (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  day_of_week     INTEGER NOT NULL,                 -- 0=Sun ... 6=Sat
  start_minute    INTEGER NOT NULL,                 -- minutes since midnight (0-1440)
  end_minute      INTEGER NOT NULL,
  active          INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_avail_day ON availability_rules(day_of_week);

-- Default availability: Mon-Sat 9am-5pm (admin can edit)
INSERT OR IGNORE INTO availability_rules (id, day_of_week, start_minute, end_minute) VALUES
  (1, 1, 540, 1020),  -- Mon 9:00-17:00
  (2, 2, 540, 1020),
  (3, 3, 540, 1020),
  (4, 4, 540, 1020),
  (5, 5, 540, 1020),
  (6, 6, 540, 1020);

-- One-off blocks (vacation, holidays, custom out-of-office)
CREATE TABLE IF NOT EXISTS availability_blocks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  start_at        TEXT NOT NULL,                    -- ISO datetime (local Central, no Z)
  end_at          TEXT NOT NULL,
  reason          TEXT
);
CREATE INDEX IF NOT EXISTS idx_blocks_range ON availability_blocks(start_at, end_at);

-- ----------------------------------------------------------------
-- Appointments: scheduled consultations + install visits
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id      INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  project_id      INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  lead_id         INTEGER REFERENCES leads(id) ON DELETE SET NULL,

  type            TEXT NOT NULL DEFAULT 'consultation', -- consultation | measure | install | service
  start_at        TEXT NOT NULL,                    -- ISO datetime (local Central, no Z; "YYYY-MM-DDTHH:MM:SS")
  end_at          TEXT NOT NULL,
  duration_min    INTEGER NOT NULL DEFAULT 60,

  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | confirmed | cancelled | completed | no-show
  source          TEXT NOT NULL DEFAULT 'web',      -- web | phone | admin | rebooked

  -- snapshot of contact info at booking time (in case contact record edited)
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT,
  site_address    TEXT,                             -- street + city + state + zip
  rooms           TEXT,                             -- "Living, Primary BR, 2 baths"
  notes           TEXT,                             -- customer-supplied notes

  -- tokens for self-service (reschedule/cancel links)
  cancel_token    TEXT UNIQUE,

  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_appt_start  ON appointments(start_at);
CREATE INDEX IF NOT EXISTS idx_appt_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appt_contact ON appointments(contact_id);

-- ----------------------------------------------------------------
-- Estimates: line-item quote captured at the site visit
-- Tokenized URL for the customer to view (no login)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estimates (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  number          TEXT NOT NULL,                    -- "EST-2026-0001"
  view_token      TEXT UNIQUE NOT NULL,             -- for /estimate/?t=...

  status          TEXT NOT NULL DEFAULT 'draft',    -- draft | sent | viewed | approved | declined | expired | superseded
  valid_until     TEXT,                             -- ISO date

  -- Totals (cached, recomputed on line change)
  subtotal_cents  INTEGER NOT NULL DEFAULT 0,
  discount_cents  INTEGER NOT NULL DEFAULT 0,
  tax_cents       INTEGER NOT NULL DEFAULT 0,
  total_cents     INTEGER NOT NULL DEFAULT 0,

  notes_customer  TEXT,                             -- shown to customer
  notes_internal  TEXT,                             -- staff only

  -- Activity timestamps
  sent_at         TEXT,
  first_viewed_at TEXT,
  last_viewed_at  TEXT,
  view_count      INTEGER NOT NULL DEFAULT 0,
  approved_at     TEXT,
  approved_by_name TEXT,                            -- typed name at approval
  approved_ip_hash TEXT,
  declined_at     TEXT,

  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  author_user_id  INTEGER REFERENCES admin_users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_estimates_project ON estimates(project_id);
CREATE INDEX IF NOT EXISTS idx_estimates_status  ON estimates(status);
CREATE INDEX IF NOT EXISTS idx_estimates_token   ON estimates(view_token);

CREATE TABLE IF NOT EXISTS estimate_lines (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  estimate_id     INTEGER NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  window_id       INTEGER REFERENCES windows(id) ON DELETE SET NULL,
  product_id      INTEGER REFERENCES products(id) ON DELETE SET NULL,

  -- Snapshot of product info at quote time (so future price changes don't mutate old estimates)
  description     TEXT NOT NULL,                    -- "Living Room - North: Faux Wood 2.5\" White, 36×60"
  room            TEXT,
  width_in        REAL,
  height_in       REAL,
  quantity        REAL NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  line_total_cents INTEGER NOT NULL DEFAULT 0,

  position        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lines_estimate ON estimate_lines(estimate_id, position);

-- ----------------------------------------------------------------
-- Proposals: dressed-up estimate with good/better/best tiers
-- A proposal references the same project + windows, with three "tier" snapshots
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS proposals (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  number          TEXT NOT NULL,                    -- "PROP-2026-0001"
  view_token      TEXT UNIQUE NOT NULL,

  status          TEXT NOT NULL DEFAULT 'draft',    -- draft | sent | viewed | tier_selected | accepted | declined | expired

  intro           TEXT,                             -- customer-facing intro paragraph
  notes_internal  TEXT,
  valid_until     TEXT,

  -- After customer picks a tier and accepts, snapshot here
  selected_tier   TEXT,                             -- good | better | best
  selected_total_cents INTEGER,
  accepted_at     TEXT,
  accepted_by_name TEXT,
  accepted_ip_hash TEXT,

  -- Engagement
  sent_at         TEXT,
  first_viewed_at TEXT,
  last_viewed_at  TEXT,
  view_count      INTEGER NOT NULL DEFAULT 0,

  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  author_user_id  INTEGER REFERENCES admin_users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_proposals_project ON proposals(project_id);
CREATE INDEX IF NOT EXISTS idx_proposals_token   ON proposals(view_token);

CREATE TABLE IF NOT EXISTS proposal_tiers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id     INTEGER NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  tier            TEXT NOT NULL,                    -- good | better | best
  title           TEXT,                             -- "The Essentials", "The Smart-Home Package", "The Heirloom Build"
  description     TEXT,
  subtotal_cents  INTEGER NOT NULL DEFAULT 0,
  tax_cents       INTEGER NOT NULL DEFAULT 0,
  total_cents     INTEGER NOT NULL DEFAULT 0,
  UNIQUE (proposal_id, tier)
);

CREATE TABLE IF NOT EXISTS proposal_tier_lines (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  tier_id         INTEGER NOT NULL REFERENCES proposal_tiers(id) ON DELETE CASCADE,
  description     TEXT NOT NULL,
  room            TEXT,
  quantity        REAL NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  line_total_cents INTEGER NOT NULL DEFAULT 0,
  position        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tier_lines ON proposal_tier_lines(tier_id, position);

-- Customer comments on proposals (per section/tier)
CREATE TABLE IF NOT EXISTS proposal_comments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id     INTEGER NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  tier            TEXT,                             -- optional: scoped to a tier
  author_kind     TEXT NOT NULL DEFAULT 'customer', -- customer | admin
  author_name     TEXT,
  body            TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_proposal_comments ON proposal_comments(proposal_id, created_at DESC);

-- ----------------------------------------------------------------
-- Contracts: the legally-binding agreement, with e-signature
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contracts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  estimate_id     INTEGER REFERENCES estimates(id) ON DELETE SET NULL,
  proposal_id     INTEGER REFERENCES proposals(id) ON DELETE SET NULL,

  number          TEXT NOT NULL,                    -- "C-2026-0001"
  view_token      TEXT UNIQUE NOT NULL,

  status          TEXT NOT NULL DEFAULT 'draft',    -- draft | sent | signed_by_customer | counter_signed | fully_executed | voided

  total_cents     INTEGER NOT NULL DEFAULT 0,
  deposit_cents   INTEGER NOT NULL DEFAULT 0,       -- portion due at signing (collected outside the system for now)
  deposit_paid    INTEGER NOT NULL DEFAULT 0,       -- admin manually flips to 1 when received (Stripe-deferred)
  deposit_paid_at TEXT,
  deposit_paid_method TEXT,                         -- "check #1234", "cash", "venmo", "ACH"

  -- The contract content
  intro           TEXT,                             -- "This agreement is between..."
  scope_html      TEXT,                             -- HTML block describing what's being installed
  terms_html      TEXT,                             -- HTML legal boilerplate (warranty, cancellation, timing)
  estimated_install_window TEXT,                    -- "Weeks 6-8 from order"

  -- Customer signature
  signed_by_customer_at TEXT,
  signer_name     TEXT,                             -- typed full legal name
  signer_email    TEXT,
  signature_image TEXT,                             -- base64 PNG from signature_pad
  signed_ip_hash  TEXT,
  signed_user_agent TEXT,
  document_hash_at_sign TEXT,                       -- SHA-256 hash of canonical contract content at sign time

  -- Counter-signature (National Closet Company)
  counter_signed_at TEXT,
  counter_signed_by_user_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  counter_signer_name TEXT,
  counter_signature_image TEXT,

  -- Activity
  sent_at         TEXT,
  first_viewed_at TEXT,
  last_viewed_at  TEXT,
  view_count      INTEGER NOT NULL DEFAULT 0,

  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  author_user_id  INTEGER REFERENCES admin_users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_contracts_project ON contracts(project_id);
CREATE INDEX IF NOT EXISTS idx_contracts_token   ON contracts(view_token);
CREATE INDEX IF NOT EXISTS idx_contracts_status  ON contracts(status);

-- Contract line items (snapshot from estimate at signing time)
CREATE TABLE IF NOT EXISTS contract_lines (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id     INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  description     TEXT NOT NULL,
  room            TEXT,
  quantity        REAL NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  line_total_cents INTEGER NOT NULL DEFAULT 0,
  position        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_contract_lines ON contract_lines(contract_id, position);

-- ----------------------------------------------------------------
-- Documents: arbitrary file attachments (uploaded photos, contracts PDFs)
-- For v1 we just store URLs (R2 not wired up yet — admin can upload externally
-- and paste URL). v2 wires up R2.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  contract_id     INTEGER REFERENCES contracts(id) ON DELETE CASCADE,
  estimate_id     INTEGER REFERENCES estimates(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,                    -- photo | floor-plan | swatch | signed-pdf | misc
  url             TEXT NOT NULL,
  filename        TEXT,
  uploaded_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------
-- Activity log: append-only audit trail across the system
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type     TEXT NOT NULL,                    -- contact | project | estimate | proposal | contract | appointment
  entity_id       INTEGER NOT NULL,
  action          TEXT NOT NULL,                    -- created | viewed | sent | approved | signed | etc.
  actor_kind      TEXT NOT NULL,                    -- admin | customer | system
  actor_id        INTEGER,                          -- admin_user_id or null
  actor_name      TEXT,                             -- snapshot of name at time of action
  details         TEXT,                             -- JSON blob
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_entity  ON activity_log(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at DESC);

-- ----------------------------------------------------------------
-- Sequence helper: auto-incrementing per-year document numbers (EST-2026-0001)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sequences (
  key             TEXT PRIMARY KEY,                 -- "estimate-2026"
  next_value      INTEGER NOT NULL DEFAULT 1
);
