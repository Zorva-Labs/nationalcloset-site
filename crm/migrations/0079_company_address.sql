-- The company's address is 513 Red River Road, Gallatin, TN 37066 (Michael,
-- 2026-10-22). The one live contract template that names where the Company is
-- based now carries the street address. Contracts already sent or signed keep
-- the terms they were sent with.
UPDATE document_templates
   SET intro = REPLACE(intro,
         'a family-owned company based in Gallatin, Tennessee (the Company)',
         'a family-owned company at 513 Red River Road, Gallatin, Tennessee 37066 (the Company)'),
       updated_at = datetime('now')
 WHERE instr(intro, 'a family-owned company based in Gallatin, Tennessee (the Company)') > 0;
