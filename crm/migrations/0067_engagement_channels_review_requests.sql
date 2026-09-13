-- 2026-09-13 — three things the lead audit asked for.
--
-- 1) The engagement beacon (page_engagement) now records the acquisition
--    channel, whether the view was a session entry, and the visitor's state,
--    so the traffic dashboard can count real visitors (only a browser running
--    our script fires the beacon) and show Tennessee alone. The edge log
--    (pageviews) gets the state too.
-- 2) Review requests go out automatically: the morning after an install is
--    completed, and two days after a design visit. The stamps below make the
--    sweep idempotent.
-- 3) A second review-request template for the post-visit email.
--
-- Apply: source ~/.env && CLOUDFLARE_API_KEY=$CLOUDFLARE_API_KEY CLOUDFLARE_EMAIL=$CLOUDFLARE_EMAIL \
--   npx wrangler d1 execute nationalcloset-crm --remote --file=crm/migrations/0067_engagement_channels_review_requests.sql
ALTER TABLE page_engagement ADD COLUMN channel TEXT;
ALTER TABLE page_engagement ADD COLUMN is_entry INTEGER;
ALTER TABLE page_engagement ADD COLUMN region TEXT;
CREATE INDEX IF NOT EXISTS idx_pe_channel ON page_engagement(channel);
ALTER TABLE pageviews ADD COLUMN region TEXT;
ALTER TABLE projects ADD COLUMN review_requested_at TEXT;
ALTER TABLE appointments ADD COLUMN review_requested_at TEXT;

INSERT INTO email_templates (name, kind, subject, body_text, body_html, is_default, is_active, created_at, updated_at)
SELECT
  'Ask for a review after a design visit',
  'review_request_visit',
  'Thanks for having us out, {{first_name}}',
  'Hi {{first_name}},

Thank you for inviting us into your home for your free design visit. Whether or not you move forward right now, we hope the visit was useful and that you have a clearer picture of what your space could be.

As a small, family-owned business, honest reviews from the people we meet mean the world to us, and they help other Middle Tennessee families find us. If you have a minute, would you mind sharing a few words about your experience on Google?

Leave a review here:
https://nationalclosetco.com/review

It takes less than a minute, and we would be truly grateful. And if anything about the visit was not what you hoped, please reply to this email or call or text me at 629-298-8241 — I would like to hear it.

Thank you,

Michael Blair
National Closet Company
629-298-8241
nationalclosetco.com',
  NULL, 0, 1, datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE kind = 'review_request_visit');
