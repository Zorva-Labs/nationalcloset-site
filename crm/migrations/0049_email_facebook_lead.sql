-- First-touch email for leads that arrive from a Facebook/Instagram lead ad.
--
-- These need their own template rather than reusing lead_new, because a Meta
-- Instant Form lead is a different animal:
--   * They weren't searching — an ad interrupted them, so the email has to
--     remind them what they signed up for or it reads as spam.
--   * The form only captures name / email / phone. There is no project type,
--     so this template must NOT use {{interest}} — renderTemplate leaves
--     unresolved tokens literal, and the customer would receive "{{interest}}".
--     Instead it asks for the missing details outright.
--   * One-tap forms mean lower intent, so the ask is a reply or a text rather
--     than jumping straight to booking.
INSERT INTO email_templates (kind, name, subject, body_text, variables_used, is_default, is_active, created_at, updated_at)
SELECT 'lead_facebook',
  'Facebook lead — first reach-out',
  '{{first_name}}, thanks for reaching out about your closet',
  'Hi {{first_name}},

Thanks for reaching out through our Facebook ad — glad the before-and-after caught your eye.

I''m Michael Blair with National Closet Company. We''re a family-owned shop right here in Middle Tennessee, and we design, build and install custom closets, pantries, garages and home offices.

The form you filled out was a quick one, so I don''t know much about your space yet. When you have a minute, just hit reply and tell me:

  - Which space are you thinking about? (walk-in, reach-in, pantry, garage, laundry room...)
  - What isn''t working about it right now?
  - Any timeline in mind?

Or if it''s easier, just call or text me at 629-298-8241.

From there the next step is a free in-home design consultation. I come out, measure, bring samples, and show you your new space in 3D — then you get an exact price, not a "starting at" number. No pressure and no obligation.

One thing worth knowing about us: we don''t run the 40%-off game. We price the job once, honestly, the first time you see it. That''s the whole idea.

Talk soon,

Michael Blair
National Closet Company
629-298-8241
nationalclosetco.com',
  'first_name', 1, 1, datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE kind = 'lead_facebook');
