-- A per-proposal, time-limited incentive line (e.g. "$800 in free upgrades if
-- you book by the 30th"). Deliberately NULL by default and set per proposal —
-- a standing offer printed on every quote just becomes the price, which is the
-- whole thing we're avoiding by giving upgrades instead of a blanket discount.
ALTER TABLE proposals ADD COLUMN promo_note TEXT;

-- The referral credit: buys leads (the actual bottleneck at an ~83% close rate)
-- and only ever pays out on a job that completes.
INSERT INTO email_templates (kind, name, subject, body_text, variables_used, is_default, is_active, created_at, updated_at)
SELECT 'referral_credit',
  'Referral credit offer',
  'Know someone who needs a closet? $250 for each of you',
  'Hi {{first_name}},

Now that your project is finished, I have a small thank-you to offer.

Most of our work comes from people telling a neighbor or a friend about us — not from ads. So we''d rather put our marketing money into your hands than into Google''s.

Here''s how it works: refer someone to National Closet Company, and when their project is installed, you each get $250. You get $250 back, and they get $250 off their project. There''s no limit and no expiration — refer as many people as you like.

All they have to do is mention your name when they reach out, or just forward them this email.

Thank you again for trusting us with your home.

Michael Blair
National Closet Company
629-298-8241',
  'first_name', 1, 1, datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE kind = 'referral_credit');
