-- 2026-11-20 — County property records removed from the CRM (Michael: "remove
-- property record, it doesn't work"). The table only cached lookups (0092).
--   npx wrangler d1 execute nationalcloset-crm --remote --file=crm/migrations/0093_drop_property.sql
DROP TABLE IF EXISTS property_records;
