-- 2026-11-20 — County property records on leads and jobs (Michael: "include
-- County property records").
--
-- /api/property looks an address up in the county's open parcel data
-- (functions/_lib/property.js: Census geocoder for the county, then Metro
-- Nashville's parcel layer and record card, the state's Sumner copy, or the
-- Williamson copy Brentwood hosts) and keeps the answer here, so a lead or job
-- page reads it from D1 after the first look. Public record only: owner of
-- record, parcel, year built, size, appraisal, last recorded sale.
--
-- Apply:
--   set -a; . ~/.env; set +a; unset CLOUDFLARE_API_KEY CLOUDFLARE_EMAIL
--   npx wrangler d1 execute nationalcloset-crm --remote --file=crm/migrations/0092_property.sql
CREATE TABLE IF NOT EXISTS property_records (
  addr_key        TEXT PRIMARY KEY,   -- the normalized address that was looked up
  status          TEXT NOT NULL,      -- found | not_found | no_source | error
  county          TEXT,
  source          TEXT,               -- davidson | sumner | williamson
  data_as_of      TEXT,               -- e.g. "Dec 2023" for the state's Sumner copy
  parcel_id       TEXT,
  owner           TEXT,
  prop_address    TEXT,
  land_use        TEXT,
  year_built      INTEGER,
  sqft            INTEGER,
  beds            INTEGER,
  baths           REAL,
  acres           REAL,
  land_value      INTEGER,            -- dollars, as the county appraises them
  impr_value      INTEGER,
  total_value     INTEGER,
  last_sale_date  TEXT,               -- YYYY-MM-DD
  last_sale_price INTEGER,
  record_url      TEXT,               -- the county's own page for this parcel
  search_url      TEXT,               -- where to look by hand when there is no open data
  note            TEXT,
  looked_up_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
