-- 2026-11-27 — The proposal follow-up's HTML heading no longer promises "a few
-- options" (Michael: "Yes, fix it"). 0088 changed the subject only; the HTML kept
-- the old heading in its <h1> and its <title>. Proposals are one option.
--   npx wrangler d1 execute nationalcloset-crm --remote --file=crm/migrations/0095_followup_heading.sql
UPDATE email_templates
   SET body_html = REPLACE(REPLACE(body_html,
         'A few options for your {{interest}} — proposal inside', 'Following up on your {{interest}} proposal'),
         '<title>A few options for your  — proposal inside</title>', '<title>Following up on your proposal</title>'),
       updated_at = datetime('now')
 WHERE id = 3 AND body_html LIKE '%A few options for your%';
