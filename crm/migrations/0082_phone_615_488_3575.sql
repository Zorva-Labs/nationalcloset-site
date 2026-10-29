-- 2026-10-29: the business number is now 615-488-3575 (Michael). It replaces
-- 615-857-5668 (migration 0076). The earlier migrations keep the old number as
-- history; this moves the live mail and document templates. Sent mail, proposals,
-- contracts and the team roster are not touched.
UPDATE email_templates SET
  subject   = replace(replace(replace(subject,   '(615) 857-5668', '(615) 488-3575'), '615-857-5668', '615-488-3575'), '6158575668', '6154883575'),
  body_text = replace(replace(replace(body_text, '(615) 857-5668', '(615) 488-3575'), '615-857-5668', '615-488-3575'), '6158575668', '6154883575'),
  body_html = replace(replace(replace(body_html, '(615) 857-5668', '(615) 488-3575'), '615-857-5668', '615-488-3575'), '6158575668', '6154883575')
WHERE subject LIKE '%857-5668%' OR body_text LIKE '%857-5668%' OR body_html LIKE '%857-5668%' OR body_html LIKE '%6158575668%';

UPDATE document_templates SET
  intro          = replace(replace(replace(intro,          '(615) 857-5668', '(615) 488-3575'), '615-857-5668', '615-488-3575'), '6158575668', '6154883575'),
  scope_html     = replace(replace(replace(scope_html,     '(615) 857-5668', '(615) 488-3575'), '615-857-5668', '615-488-3575'), '6158575668', '6154883575'),
  terms_html     = replace(replace(replace(terms_html,     '(615) 857-5668', '(615) 488-3575'), '615-857-5668', '615-488-3575'), '6158575668', '6154883575'),
  notes_customer = replace(replace(replace(notes_customer, '(615) 857-5668', '(615) 488-3575'), '615-857-5668', '615-488-3575'), '6158575668', '6154883575')
WHERE coalesce(intro,'') || coalesce(scope_html,'') || coalesce(terms_html,'') || coalesce(notes_customer,'') LIKE '%857-5668%'
   OR coalesce(intro,'') || coalesce(scope_html,'') || coalesce(terms_html,'') || coalesce(notes_customer,'') LIKE '%6158575668%';
