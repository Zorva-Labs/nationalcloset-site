-- Graceful close-out for a lead that has gone quiet.
--
-- Deliberately releases pressure instead of chasing: it thanks them, states the
-- assumption plainly, and tells them they don't need to reply. That framing
-- tends to get more genuine responses than another "just following up" — the
-- ones who were still interested speak up, and the rest close cleanly with the
-- relationship intact for a future re-engagement.
--
-- Uses ONLY {{first_name}}. Lost leads arrive from every stage — some never got
-- a proposal — so {{interest}}, {{quoted_amount}} and {{proposal_link}} are
-- avoided: renderTemplate leaves unresolved tokens literal, and the customer
-- would receive "{{interest}}" in their inbox.
--
-- bind_lead_status is set to 'lost' for future wiring; nothing reads it today,
-- so this template is picked manually when sending from the lead screen.
INSERT INTO email_templates (kind, name, subject, body_text, variables_used,
                             bind_lead_status, is_default, is_active, created_at, updated_at)
SELECT 'lead_lost',
  'Lost lead — graceful close-out',
  'Closing the loop on your closet project',
  'Hi {{first_name}},

Thank you for the opportunity to earn your business — I genuinely appreciated you considering us for your project.

I haven''t heard back, so I''m assuming either the timing isn''t right or you''ve decided to go a different direction. That''s completely okay, and there''s no need to reply to this.

I''ll close out your file for now so you aren''t getting follow-ups you didn''t ask for.

If anything changes down the road — a new timeline, a different space, or just a question — reach out anytime. Your in-home design consultation is always free, there''s never any pressure, and I''d be glad to pick things up right where we left off.

Thanks again, and best of luck with the project either way.

Michael Blair
National Closet Company
629-298-8241
nationalclosetco.com',
  'first_name', 'lost', 1, 1, datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE kind = 'lead_lost');
