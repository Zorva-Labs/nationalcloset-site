-- 0015: rename lead pipeline statuses to the simpler 7-stage flow.
--   New → Replied → Consult → Proposal → Booked → Installed → Lost
--
-- Mapping:
--   contacted  → replied
--   scheduled  → consult
--   quoted     → proposal
--   won        → booked
--   spam       → lost     (folded in; the "spam" stage was redundant)
--   new, installed, lost → unchanged
--
-- Apply via:
--   source ~/.env && CLOUDFLARE_API_KEY=$CLOUDFLARE_API_KEY CLOUDFLARE_EMAIL=$CLOUDFLARE_EMAIL \
--     npx wrangler@latest d1 execute nationalcloset-crm --remote \
--     --file=crm/migrations/0015_rename_lead_statuses.sql

UPDATE leads SET status = 'replied'  WHERE status = 'contacted';
UPDATE leads SET status = 'consult'  WHERE status = 'scheduled';
UPDATE leads SET status = 'proposal' WHERE status = 'quoted';
UPDATE leads SET status = 'booked'   WHERE status = 'won';
UPDATE leads SET status = 'lost'     WHERE status = 'spam';

-- Activity log entries that referenced the old status names — keep history but
-- update any that explicitly logged a status transition string.
UPDATE activity_log SET action = 'replied'  WHERE entity_type='lead' AND action = 'contacted';
UPDATE activity_log SET action = 'consult'  WHERE entity_type='lead' AND action = 'scheduled';
UPDATE activity_log SET action = 'proposal' WHERE entity_type='lead' AND action = 'quoted';
UPDATE activity_log SET action = 'booked'   WHERE entity_type='lead' AND action = 'won';
