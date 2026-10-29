-- Which company a lead and its job belong to. Nashville Luxury Closets &
-- Cabinets (NLC, nashvilleluxuryclosets.com) is a d/b/a of National Closet
-- Company and shares this CRM; Terry McCarthy, 2026-10-29: "We could probably
-- use the same CRM. Just need to do something to delineate whether it's a NCC
-- or NLC lead, sale, service job, etc." Every existing row is NCC. NLC leads
-- arrive through /api/intake/lead; a job made from a lead takes the lead's brand.
-- external_id is the sending site's own lead id ("NLC:12"), so a resend is not
-- a second lead.
-- Apply: npx wrangler d1 execute nationalcloset-crm --remote --file=crm/migrations/0081_brand.sql
ALTER TABLE leads ADD COLUMN brand TEXT NOT NULL DEFAULT 'NCC';
ALTER TABLE leads ADD COLUMN external_id TEXT;
ALTER TABLE projects ADD COLUMN brand TEXT NOT NULL DEFAULT 'NCC';
CREATE INDEX IF NOT EXISTS idx_leads_brand ON leads(brand);
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_external ON leads(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_brand ON projects(brand);
