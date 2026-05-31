-- 1) proposals get a default_contract_type column so the admin can choose,
--    at proposal-build time, which contract template to attach when the
--    customer accepts. Defaults to 'custom_order' so existing proposals
--    behave the same as before.
ALTER TABLE proposals ADD COLUMN default_contract_type TEXT NOT NULL DEFAULT 'custom_order';

-- 2) Seed a generic "Professional Installation" product in the service catalog.
--    The existing install SKUs (INST-STD, INST-SHUT, INST-MOTOR, INST-MIN)
--    stay — this one is the catch-all admins use as a default.
INSERT OR IGNORE INTO products (sku, name, category, unit, base_price_cents, price_per_sqft_cents, position) VALUES
  ('INST-PRO', 'Professional Installation', 'install', 'window', 6500, 0, 26);
