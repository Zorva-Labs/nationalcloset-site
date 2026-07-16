-- Google's click identifier, captured off the landing URL. This is the only
-- thing that ties a lead back to an actual ad click — utm_* can be spoofed or
-- stripped, gclid is Google's own id and is what offline conversion import
-- needs if we ever upload booked jobs back to Ads.
ALTER TABLE leads ADD COLUMN gclid TEXT;

-- The page they first landed on, and where they came from before that. The
-- referrer column already existed but only ever received our own page URL,
-- because it was read from the /api/contact request headers rather than from
-- the landing page.
ALTER TABLE leads ADD COLUMN landing_page TEXT;
