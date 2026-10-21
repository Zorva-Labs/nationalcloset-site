-- The deposit is 50% of the total, with no materials floor (Michael,
-- 2026-10-21). Takes the "or, if greater, the amount required to cover the
-- materials and shipping" clause out of the two contract templates that carry
-- it. Contracts already sent or signed keep the terms they were sent with.
UPDATE document_templates
   SET terms_html = REPLACE(terms_html,
         '(the &ldquo;Deposit&rdquo;) &mdash; or, if greater, the amount required to cover the materials and shipping for this order. Manufacturing',
         '(the &ldquo;Deposit&rdquo;). Manufacturing'),
       updated_at = datetime('now')
 WHERE instr(terms_html, 'if greater, the amount required to cover the materials and shipping') > 0;
