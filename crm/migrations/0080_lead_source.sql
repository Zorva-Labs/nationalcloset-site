-- Where each lead came from, on the lead itself (Michael, 2026-10-24: every
-- form sends the traffic info with the lead; the estate's one list is
-- ~/site-kit/form/migrations/lead_source.sql).
--
-- Filled right after the insert by functions/api/contact.js (functions/_lib/
-- lead-visit.js over _lib/visit.js) from the first-party entry cookie the edge
-- middleware sets on the visit's first hit (channel, referrer, landing page,
-- device, when the visit started) and from request.cf (the rest). The same
-- context goes into the staff alert mail, not the customer's acknowledgment.
--
-- NOT added here, because leads already has them with the form's own values:
-- utm_source, utm_medium and gclid (the gclid is the click id itself, TEXT, not
-- the kit's 0/1) and landing_page. The kit's `landing` below is the page the
-- visit began on, from the cookie; landing_page stays what the form sent.
-- Applied once: npx wrangler d1 execute nationalcloset-crm --remote --file=crm/migrations/0080_lead_source.sql
-- (2026-10-24: the columns were added with a PRAGMA check first, node ~/site-kit/bin/add-lead-source.mjs's method.)
--
-- geo_* is the edge's estimate of where the connection was, kept apart from
-- the city/state/zip the customer typed. No IP address is stored here; ip_hash
-- is the existing one.
ALTER TABLE leads ADD COLUMN channel       TEXT;     -- Google Ads | Google (organic) | AI search | Direct …
ALTER TABLE leads ADD COLUMN referrer_host TEXT;     -- host that sent them, when there was one
ALTER TABLE leads ADD COLUMN landing       TEXT;     -- the page they entered the site on
ALTER TABLE leads ADD COLUMN device        TEXT;     -- mobile | tablet | desktop
ALTER TABLE leads ADD COLUMN first_seen    TEXT;     -- when the visit started, for time-to-convert
ALTER TABLE leads ADD COLUMN browser       TEXT;
ALTER TABLE leads ADD COLUMN os            TEXT;
ALTER TABLE leads ADD COLUMN language      TEXT;
ALTER TABLE leads ADD COLUMN geo_city      TEXT;
ALTER TABLE leads ADD COLUMN geo_region    TEXT;
ALTER TABLE leads ADD COLUMN geo_postal    TEXT;
ALTER TABLE leads ADD COLUMN metro         TEXT;
ALTER TABLE leads ADD COLUMN timezone      TEXT;
ALTER TABLE leads ADD COLUMN isp           TEXT;
ALTER TABLE leads ADD COLUMN asn           INTEGER;
