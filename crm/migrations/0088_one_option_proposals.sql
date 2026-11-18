-- One option per proposal; wall repair and paint no longer offered
-- (Michael, 2026-11-18: "remove the second option on proposals, we no longer
-- offer wall repair and painting. set everything as one proposal, fix contracts").
-- Signed wallprep contracts and accepted two-option proposals stay as they are.

-- The proposal template (row 4): one option, no Option 2.
UPDATE document_templates
   SET name = 'Proposal — design, build & install (one option)',
       intro = 'Thank you for the opportunity to design your project. Below is your proposal to design, build and professionally install your new custom system. We''re glad to answer any questions.',
       tier_good_title = 'Custom Closet — Design, Build & Professional Install',
       tier_better_title = NULL,
       tier_best_title = NULL,
       updated_at = datetime('now')
 WHERE id = 4 AND kind = 'proposal';

-- The walls-as-is contract (row 1): nothing is repaired, so nothing but the
-- install is scheduled.
UPDATE document_templates
   SET name = 'Custom Closet — Design & Install (walls as-is)',
       terms_html = replace(terms_html, 'will schedule any repairs and the installation', 'will schedule the installation'),
       updated_at = datetime('now')
 WHERE id = 1 AND kind = 'contract';

-- The wall repair & paint contract (row 6): retired, no longer a default.
UPDATE document_templates
   SET name = 'RETIRED 2026-11-18 — Design & Install + Wall Repair & Paint (no longer offered)',
       is_default = 0,
       updated_at = datetime('now')
 WHERE id = 6 AND kind = 'contract' AND subkind = 'wallprep';

-- The proposal follow-up mail no longer promises "a few options".
UPDATE email_templates
   SET subject = 'Your {{interest}} proposal — inside'
 WHERE id = 3 AND subject = 'A few options for your {{interest}} — proposal inside';

-- The two unsent, unpriced drafts (PROP-2026-0057, -0058) lose their Option 2.
DELETE FROM proposal_tier_lines
 WHERE tier_id IN (SELECT t.id FROM proposal_tiers t JOIN proposals p ON p.id = t.proposal_id
                    WHERE p.status = 'draft' AND t.tier = 'better');
DELETE FROM proposal_tiers
 WHERE tier = 'better' AND proposal_id IN (SELECT id FROM proposals WHERE status = 'draft');
UPDATE proposal_tiers
   SET title = 'Custom Closet — Design, Build & Professional Install',
       description = 'We design, build and professionally install your new custom system. Before install day the space should be empty: you take out the existing shelving and handle any patching or painting you want done, because we do not repair or paint walls.'
 WHERE tier = 'good' AND title = 'Option 1'
   AND proposal_id IN (SELECT id FROM proposals WHERE status = 'draft');
UPDATE proposals
   SET intro = 'Thank you for the opportunity to design your project. Below is your proposal to design, build and professionally install your new custom system. We''re glad to answer any questions.',
       updated_at = datetime('now')
 WHERE status = 'draft';
