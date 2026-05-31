-- 0016: 2026 Nashville-metro market pricing refresh.
--
-- Every catalog product gets a new base_price_cents reflecting current
-- competitor rates (Budget Blinds, 3 Day Blinds, Made in the Shade, Hunter
-- Douglas dealers, HomeGuide / Angi / Homewyse 2026 surveys). Positioning is
-- "premium local installer" — roughly +15-20% over big-box installed pricing
-- and -20-30% below Hunter Douglas full-retail dealer pricing.
--
-- INST-PRO is dropped to $0 because professional install is now bundled into
-- product retail when the customer buys product through Stately. The
-- install-only SKUs (INST-STD/SHUT/MOTOR/MIN) remain for customer-supplied
-- product jobs.
--
-- Apply via:
--   source ~/.env && CLOUDFLARE_API_KEY=$CLOUDFLARE_API_KEY CLOUDFLARE_EMAIL=$CLOUDFLARE_EMAIL \
--     npx wrangler@latest d1 execute nationalcloset-crm --remote \
--     --file=crm/migrations/0016_update_market_pricing.sql

-- ── Faux + real wood blinds ────────────────────────────────────────────────
UPDATE products SET base_price_cents = 18900  WHERE sku = 'FW25-WHT';   -- $189
UPDATE products SET base_price_cents = 16900  WHERE sku = 'FW20-WHT';   -- $169
UPDATE products SET base_price_cents = 32900  WHERE sku = 'RW25-NAT';   -- $329

-- ── Cellular shades ────────────────────────────────────────────────────────
UPDATE products SET base_price_cents = 20900  WHERE sku = 'CELL-LF';    -- $209
UPDATE products SET base_price_cents = 32900  WHERE sku = 'CELL-BO';    -- $329
UPDATE products SET base_price_cents = 5500   WHERE sku = 'CELL-TD';    -- $55 (add-on)

-- ── Roller + solar + zebra ─────────────────────────────────────────────────
UPDATE products SET base_price_cents = 17900  WHERE sku = 'ROLL-LF';    -- $179
UPDATE products SET base_price_cents = 22900  WHERE sku = 'ROLL-BO';    -- $229
UPDATE products SET base_price_cents = 21900  WHERE sku = 'SOL-3';      -- $219
UPDATE products SET base_price_cents = 24900  WHERE sku = 'ZEB-STD';    -- $249

-- ── Woven wood + Roman ─────────────────────────────────────────────────────
UPDATE products SET base_price_cents = 54900  WHERE sku = 'WW-PROV';    -- $549
UPDATE products SET base_price_cents = 62900  WHERE sku = 'VIG-MOD';    -- $629
UPDATE products SET base_price_cents = 38900  WHERE sku = 'ROMAN-STD';  -- $389

-- ── Hunter Douglas sheers ──────────────────────────────────────────────────
UPDATE products SET base_price_cents = 71900  WHERE sku = 'SIL-25';     -- $719
UPDATE products SET base_price_cents = 75900  WHERE sku = 'PIR-STD';    -- $759
UPDATE products SET base_price_cents = 32900  WHERE sku = 'LUM-STD';    -- $329 per panel (was per opening)

-- ── Plantation shutters ────────────────────────────────────────────────────
UPDATE products SET base_price_cents = 32900  WHERE sku = 'PS-COMP';    -- $329
UPDATE products SET base_price_cents = 48900  WHERE sku = 'PS-BASS';    -- $489
UPDATE products SET base_price_cents = 24900  WHERE sku = 'PS-MOTOR';   -- $249 upgrade

-- ── Drapery (per panel) ────────────────────────────────────────────────────
UPDATE products SET base_price_cents = 28900  WHERE sku = 'DRP-PANEL';  -- $289
UPDATE products SET base_price_cents = 19900  WHERE sku = 'DRP-SHEER';  -- $199

-- ── Motorization ───────────────────────────────────────────────────────────
UPDATE products SET base_price_cents = 29900  WHERE sku = 'MOT-ROLL';   -- $299
UPDATE products SET base_price_cents = 32900  WHERE sku = 'MOT-CELL';   -- $329
UPDATE products SET base_price_cents = 32900  WHERE sku = 'MOT-HUB';    -- $329

-- ── Outdoor ────────────────────────────────────────────────────────────────
UPDATE products SET base_price_cents = 149500 WHERE sku = 'OUT-SOLAR';  -- $1,495
UPDATE products SET base_price_cents = 74900  WHERE sku = 'OUT-SCREEN'; -- $749

-- ── Installation services ──────────────────────────────────────────────────
UPDATE products SET base_price_cents = 0      WHERE sku = 'INST-PRO';   -- bundled (free)
UPDATE products SET base_price_cents = 6500   WHERE sku = 'INST-STD';   -- $65
UPDATE products SET base_price_cents = 12500  WHERE sku = 'INST-SHUT';  -- $125
UPDATE products SET base_price_cents = 13500  WHERE sku = 'INST-MOTOR'; -- $135 (unchanged)
UPDATE products SET base_price_cents = 18500  WHERE sku = 'INST-MIN';   -- $185 (unchanged)

-- ── Repair services ────────────────────────────────────────────────────────
UPDATE products SET base_price_cents = 9500   WHERE sku = 'REP-STD';    -- $95
UPDATE products SET base_price_cents = 18500  WHERE sku = 'REP-MOTOR';  -- $185
UPDATE products SET base_price_cents = 12500  WHERE sku = 'REP-MIN';    -- $125
