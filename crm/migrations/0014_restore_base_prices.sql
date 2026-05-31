-- 0014: restore base_price_cents for every catalog product.
--
-- Migration 0005 moved pricing to per-sqft and zeroed out base_price_cents.
-- Migration 0009 then zeroed out per-sqft (when we decided pricing is per-unit
-- after all). Net result: every product ended up at $0 and seedTiersFromWindows
-- has been generating $0 lines. This restores the per-window prices that were
-- originally seeded in migration 0003, so picking a product on a window puts a
-- real number on the proposal.
--
-- Apply via:
--   source ~/.env && CLOUDFLARE_API_KEY=$CLOUDFLARE_API_KEY CLOUDFLARE_EMAIL=$CLOUDFLARE_EMAIL \
--     npx wrangler@latest d1 execute nationalcloset-crm --remote \
--     --file=crm/migrations/0014_restore_base_prices.sql

UPDATE products SET base_price_cents = 8900   WHERE sku = 'FW25-WHT';
UPDATE products SET base_price_cents = 7900   WHERE sku = 'FW20-WHT';
UPDATE products SET base_price_cents = 18000  WHERE sku = 'RW25-NAT';
UPDATE products SET base_price_cents = 12000  WHERE sku = 'CELL-LF';
UPDATE products SET base_price_cents = 22000  WHERE sku = 'CELL-BO';
UPDATE products SET base_price_cents = 4000   WHERE sku = 'CELL-TD';
UPDATE products SET base_price_cents = 12000  WHERE sku = 'ROLL-LF';
UPDATE products SET base_price_cents = 16000  WHERE sku = 'ROLL-BO';
UPDATE products SET base_price_cents = 16000  WHERE sku = 'SOL-3';
UPDATE products SET base_price_cents = 18000  WHERE sku = 'ZEB-STD';
UPDATE products SET base_price_cents = 26000  WHERE sku = 'WW-PROV';
UPDATE products SET base_price_cents = 42000  WHERE sku = 'VIG-MOD';
UPDATE products SET base_price_cents = 28000  WHERE sku = 'ROMAN-STD';
UPDATE products SET base_price_cents = 48000  WHERE sku = 'SIL-25';
UPDATE products SET base_price_cents = 52000  WHERE sku = 'PIR-STD';
UPDATE products SET base_price_cents = 120000 WHERE sku = 'LUM-STD';
UPDATE products SET base_price_cents = 35000  WHERE sku = 'PS-COMP';
UPDATE products SET base_price_cents = 70000  WHERE sku = 'PS-BASS';
UPDATE products SET base_price_cents = 30000  WHERE sku = 'PS-MOTOR';
UPDATE products SET base_price_cents = 68000  WHERE sku = 'DRP-PANEL';
UPDATE products SET base_price_cents = 42000  WHERE sku = 'DRP-SHEER';
UPDATE products SET base_price_cents = 22000  WHERE sku = 'MOT-ROLL';
UPDATE products SET base_price_cents = 24000  WHERE sku = 'MOT-CELL';
-- MOT-HUB already at 20000 — leave alone
UPDATE products SET base_price_cents = 240000 WHERE sku = 'OUT-SOLAR';
UPDATE products SET base_price_cents = 180000 WHERE sku = 'OUT-SCREEN';
UPDATE products SET base_price_cents = 5500   WHERE sku = 'INST-STD';
UPDATE products SET base_price_cents = 9500   WHERE sku = 'INST-SHUT';
UPDATE products SET base_price_cents = 13500  WHERE sku = 'INST-MOTOR';
UPDATE products SET base_price_cents = 18500  WHERE sku = 'INST-MIN';
UPDATE products SET base_price_cents = 7500   WHERE sku = 'REP-STD';
UPDATE products SET base_price_cents = 22000  WHERE sku = 'REP-MOTOR';
UPDATE products SET base_price_cents = 9500   WHERE sku = 'REP-MIN';
-- INST-PRO (from migration 0011) — set a per-window install rate
UPDATE products SET base_price_cents = 7500   WHERE sku = 'INST-PRO';
