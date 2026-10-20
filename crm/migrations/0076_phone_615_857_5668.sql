-- 2026-10-20: the business number is now 615-857-5668 (Terry McCarthy's email,
-- "National Closet Company - phone number"). 629-298-8241 is Nashville's Web
-- Design's own line. The earlier migrations keep the old number as history; this
-- moves the live mail and document templates. Sent mail, proposals, contracts and
-- the team roster (Michael's own phone) are not touched.
UPDATE email_templates SET
  subject   = replace(replace(replace(subject,   '(629) 298-8241', '(615) 857-5668'), '629-298-8241', '615-857-5668'), '6292988241', '6158575668'),
  body_text = replace(replace(replace(body_text, '(629) 298-8241', '(615) 857-5668'), '629-298-8241', '615-857-5668'), '6292988241', '6158575668'),
  body_html = replace(replace(replace(body_html, '(629) 298-8241', '(615) 857-5668'), '629-298-8241', '615-857-5668'), '6292988241', '6158575668')
WHERE subject LIKE '%298-8241%' OR body_text LIKE '%298-8241%' OR body_html LIKE '%298-8241%' OR body_html LIKE '%6292988241%';

UPDATE document_templates SET
  intro          = replace(replace(replace(intro,          '(629) 298-8241', '(615) 857-5668'), '629-298-8241', '615-857-5668'), '6292988241', '6158575668'),
  scope_html     = replace(replace(replace(scope_html,     '(629) 298-8241', '(615) 857-5668'), '629-298-8241', '615-857-5668'), '6292988241', '6158575668'),
  terms_html     = replace(replace(replace(terms_html,     '(629) 298-8241', '(615) 857-5668'), '629-298-8241', '615-857-5668'), '6292988241', '6158575668'),
  notes_customer = replace(replace(replace(notes_customer, '(629) 298-8241', '(615) 857-5668'), '629-298-8241', '615-857-5668'), '6292988241', '6158575668')
WHERE coalesce(intro,'') || coalesce(scope_html,'') || coalesce(terms_html,'') || coalesce(notes_customer,'') LIKE '%298-8241%'
   OR coalesce(intro,'') || coalesce(scope_html,'') || coalesce(terms_html,'') || coalesce(notes_customer,'') LIKE '%6292988241%';
