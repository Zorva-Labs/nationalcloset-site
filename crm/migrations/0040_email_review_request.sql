-- Seed a "Ask for a Google review" email template. Guarded so re-running won't
-- duplicate it. Uses the same plain-text + {{merge_field}} convention as the
-- other templates; the review URL sits on its own line so email clients link it.
INSERT INTO email_templates (name, kind, subject, body_text, body_html, is_default, is_active, created_at, updated_at)
SELECT
  'Ask for a Google review',
  'review_request',
  'How did we do, {{first_name}}? A quick review would mean a lot',
  'Hi {{first_name}},

Thank you again for choosing National Closet Company. It was a pleasure designing and installing your new space, and we hope you are loving the result!

As a small, family-owned business, honest reviews from customers like you mean the world to us, and they help other Middle Tennessee families find us. If you have a minute, would you mind sharing a few words about your experience on Google?

Leave a review here:
https://g.page/r/Calj4533P4lBEBM/review

It takes less than a minute, and we would be truly grateful. If anything was not perfect, please reply to this email or call or text me at 629-298-8241, and I would love the chance to make it right.

Thank you for your trust and support!

Michael Blair
National Closet Company
629-298-8241
nationalclosetco.com',
  NULL, 0, 1, datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE kind = 'review_request');
