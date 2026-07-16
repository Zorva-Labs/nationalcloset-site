-- The lead form now captures name/phone/email/project only, and asks for the
-- service address on the confirmation step — so the lead (and the ad
-- conversion) is banked before the long fields are ever shown.
--
-- That second step needs to attach an address to the lead it just created,
-- without exposing lead ids to the public (POST /api/contact/address?id=27
-- would let anyone overwrite any lead). The token is returned once, to the
-- browser that created the lead, and is the only key that endpoint accepts.
ALTER TABLE leads ADD COLUMN update_token TEXT;
CREATE INDEX IF NOT EXISTS idx_leads_update_token ON leads(update_token);
