-- Migration 0002: split structured address fields into the leads table.
-- The legacy `location` column is preserved for old free-text values.
-- Applied to the live D1 via the Cloudflare query API on 2026-05-24.

ALTER TABLE leads ADD COLUMN address_street TEXT;
ALTER TABLE leads ADD COLUMN address_city   TEXT;
ALTER TABLE leads ADD COLUMN address_state  TEXT;
ALTER TABLE leads ADD COLUMN address_zip    TEXT;
