-- GA4 client + session id captured when the lead form is submitted, so a booked
-- consultation can be sent to GA4 as an offline key event and imported by Google Ads.
ALTER TABLE leads ADD COLUMN ga_client_id TEXT;
ALTER TABLE leads ADD COLUMN ga_session_id TEXT;
