-- 2026-09-17 — custom cabinets became a service (nationalclosetco.com/custom-cabinets-nashville).
--
-- The contract and proposal templates the CRM stores describe the work as "custom
-- closets and storage systems". A cabinet job signs the same documents, so the stored
-- wording now says "custom closets, cabinetry and storage systems", matching the code
-- fallbacks in functions/_lib/lifecycle.js and functions/api/contracts/index.js.
-- Plain string replacement: rows that never used the phrase are untouched.
--
-- Apply via:
--   source ~/.env && CLOUDFLARE_API_KEY=$CLOUDFLARE_API_KEY CLOUDFLARE_EMAIL=$CLOUDFLARE_EMAIL \
--     npx wrangler d1 execute nationalcloset-crm --remote \
--     --file=crm/migrations/0068_cabinetry_in_document_templates.sql

UPDATE document_templates SET
  intro      = REPLACE(REPLACE(intro,      'custom closets and storage systems', 'custom closets, cabinetry and storage systems'), 'installation of closets and storage systems', 'installation of closets, cabinetry and storage systems'),
  scope_html = REPLACE(REPLACE(scope_html, 'custom closets and storage systems', 'custom closets, cabinetry and storage systems'), 'installation of closets and storage systems', 'installation of closets, cabinetry and storage systems'),
  terms_html = REPLACE(REPLACE(terms_html, 'custom closets and storage systems', 'custom closets, cabinetry and storage systems'), 'installation of closets and storage systems', 'installation of closets, cabinetry and storage systems')
WHERE kind IN ('contract', 'proposal');

-- The live rows (1 custom_order, 6 wallprep) were written by hand and use a different
-- phrasing than the code fallbacks; cover it too.
UPDATE document_templates SET
  intro      = REPLACE(REPLACE(intro,      'Custom Closet Design &amp; Installation Agreement', 'Custom Closet &amp; Cabinetry Design &amp; Installation Agreement'), 'a custom closet or storage system', 'a custom closet, cabinetry or storage system'),
  scope_html = REPLACE(scope_html, 'a custom closet or storage system', 'a custom closet, cabinetry or storage system'),
  terms_html = REPLACE(terms_html, 'a custom closet or storage system', 'a custom closet, cabinetry or storage system')
WHERE kind = 'contract';
