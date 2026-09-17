-- 2026-09-17 — the owner confirmed the lifetime warranty covers custom cabinets.
--
-- The Limited Warranty clause in the stored contract templates (rows 1 custom_order and
-- 6 wallprep) lists the covered components; cabinet boxes, doors and drawer fronts join
-- the list, matching functions/api/contracts/index.js and the /warranty page.
--
-- Apply via:
--   source ~/.env && CLOUDFLARE_API_KEY=$CLOUDFLARE_API_KEY CLOUDFLARE_EMAIL=$CLOUDFLARE_EMAIL \
--     npx wrangler d1 execute nationalcloset-crm --remote \
--     --file=crm/migrations/0069_cabinetry_in_warranty_clause.sql

UPDATE document_templates SET
  terms_html = REPLACE(terms_html,
    'warrants the closet and storage system components it supplies (panels, shelving, drawer boxes, rods, brackets, hinges, slides and hardware)',
    'warrants the closet, cabinetry and storage system components it supplies (panels, cabinet boxes, doors, drawer boxes and fronts, shelving, rods, brackets, hinges, slides and hardware)')
WHERE kind = 'contract';
