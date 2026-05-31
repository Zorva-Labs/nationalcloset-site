-- National Closet Company CRM — Inch-based products + install-only contract type
-- Apply via: source ~/.env && CLOUDFLARE_API_KEY=$CLOUDFLARE_API_KEY CLOUDFLARE_EMAIL=$CLOUDFLARE_EMAIL \
--   npx wrangler@latest d1 execute nationalcloset-crm --remote --file=crm/migrations/0005_inches_and_install.sql

-- ----------------------------------------------------------------
-- contracts.contract_type — distinguish full custom orders from
-- install-only / repair-only / service-call contracts (each has
-- different default terms, deposit rules, and warranty language)
-- ----------------------------------------------------------------
ALTER TABLE contracts ADD COLUMN contract_type TEXT NOT NULL DEFAULT 'custom_order';
-- Valid values: custom_order | install_only | repair | service_call

-- ----------------------------------------------------------------
-- Capture inch dimensions on contract & proposal-tier line items
-- (estimate_lines already had them from migration 0003)
-- ----------------------------------------------------------------
ALTER TABLE contract_lines ADD COLUMN width_in REAL;
ALTER TABLE contract_lines ADD COLUMN height_in REAL;
ALTER TABLE proposal_tier_lines ADD COLUMN width_in REAL;
ALTER TABLE proposal_tier_lines ADD COLUMN height_in REAL;

-- ----------------------------------------------------------------
-- Products — every product gets a per-square-foot rate so estimate
-- lines can be computed automatically from width × height in inches.
-- Where a product had base_price > 0 and per_sqft = 0, we backfill
-- per_sqft = base / 15 (the price for a typical 36×60" window),
-- and clear the base so the formula scales correctly. Products
-- without a window scale (motors, hubs, repair flat fees) keep
-- their base_price as a flat fee and stay at per_sqft = 0.
-- ----------------------------------------------------------------
-- Faux wood — currently $89/window flat, convert to ~$6/sqft
UPDATE products SET price_per_sqft_cents = 594, base_price_cents = 0 WHERE sku = 'FW25-WHT';
UPDATE products SET price_per_sqft_cents = 527, base_price_cents = 0 WHERE sku = 'FW20-WHT';
-- Real wood — currently $180/window, convert to ~$12/sqft
UPDATE products SET price_per_sqft_cents = 1200, base_price_cents = 0 WHERE sku = 'RW25-NAT';
-- Roller — currently $120 + $2.50/sqft → keep simpler: $8/sqft, no base
UPDATE products SET price_per_sqft_cents = 800, base_price_cents = 0 WHERE sku = 'ROLL-LF';
UPDATE products SET price_per_sqft_cents = 1067, base_price_cents = 0 WHERE sku = 'ROLL-BO';
-- Solar — $16/sqft
UPDATE products SET price_per_sqft_cents = 1067, base_price_cents = 0 WHERE sku = 'SOL-3';
-- Zebra — $12/sqft
UPDATE products SET price_per_sqft_cents = 1200, base_price_cents = 0 WHERE sku = 'ZEB-STD';
-- Cellular — already had per_sqft; reset base to 0
UPDATE products SET price_per_sqft_cents = 800, base_price_cents = 0 WHERE sku = 'CELL-LF';
UPDATE products SET price_per_sqft_cents = 1467, base_price_cents = 0 WHERE sku = 'CELL-BO';
-- Cellular TD upgrade — keep as a flat per-window upgrade (not measurement-based)
-- CELL-TD stays base $40/window, per_sqft 0
-- Woven wood — $17/sqft
UPDATE products SET price_per_sqft_cents = 1733, base_price_cents = 0 WHERE sku = 'WW-PROV';
-- Vignette modern Roman — $28/sqft
UPDATE products SET price_per_sqft_cents = 2800, base_price_cents = 0 WHERE sku = 'VIG-MOD';
-- Standard Roman — $19/sqft
UPDATE products SET price_per_sqft_cents = 1867, base_price_cents = 0 WHERE sku = 'ROMAN-STD';
-- Silhouette — $32/sqft
UPDATE products SET price_per_sqft_cents = 3200, base_price_cents = 0 WHERE sku = 'SIL-25';
-- Pirouette — $35/sqft
UPDATE products SET price_per_sqft_cents = 3467, base_price_cents = 0 WHERE sku = 'PIR-STD';
-- Luminette stays per-panel (it's vertical, doesn't scale by sqft the same way)
-- Composite plantation — $23/sqft
UPDATE products SET price_per_sqft_cents = 2333, base_price_cents = 0 WHERE sku = 'PS-COMP';
-- Basswood plantation — $47/sqft
UPDATE products SET price_per_sqft_cents = 4667, base_price_cents = 0 WHERE sku = 'PS-BASS';
-- Plantation motor upgrade — flat per window, keep as-is
-- Drapery panels stay per-panel (already use 'panel' unit)
-- Motorization upgrades stay flat per window (already do)
-- Outdoor stays at flat (specialty install)

-- Install services convert to per-sqft so larger windows cost more to install
UPDATE products SET price_per_sqft_cents = 367, base_price_cents = 0 WHERE sku = 'INST-STD';   -- ~$55 for 36×60
UPDATE products SET price_per_sqft_cents = 633, base_price_cents = 0 WHERE sku = 'INST-SHUT';  -- ~$95 for 36×60
-- INST-MOTOR stays flat per shade (programming time isn't measurement-based)
-- INST-MIN stays as a flat service-call minimum

-- Repair stays flat per blind (repair labor isn't measurement-based)

-- ----------------------------------------------------------------
-- Mark products to indicate their pricing model is measurement-based.
-- The UI checks unit + price_per_sqft to decide whether to ask for dimensions.
-- ----------------------------------------------------------------
-- Already done — no schema change needed. The convention is:
--   unit='window' + price_per_sqft > 0 → ask for width × height in inches
--   unit='window' + price_per_sqft = 0 → ask for quantity only (flat per-window)
--   unit='panel' + price_per_sqft = 0 → ask for quantity only (per-panel)
--   unit='flat' → no dimensions, no quantity (true flat fee)
