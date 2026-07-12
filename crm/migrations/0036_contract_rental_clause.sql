-- Append a rental/leased-property permission clause to every default contract
-- template (custom_order, wallprep, install_only, repair). Guarded so re-running
-- is idempotent. New contracts snapshot terms_html at creation, so this affects
-- contracts created going forward.
UPDATE document_templates
SET terms_html = terms_html || '
<h3>Rental or Leased Property</h3>
<p>If this property is rented or leased, you confirm that you have obtained the property owner''s or landlord''s written permission for National Closet Company to remove any existing shelving, cabinets or fixtures and to install our systems in their place. Obtaining this permission is the customer''s responsibility, and National Closet Company is not liable for any dispute arising from the lack of it.</p>'
WHERE kind = 'contract' AND terms_html NOT LIKE '%Rental or Leased Property%';
