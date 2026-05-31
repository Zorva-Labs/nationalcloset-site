-- National Closet Company CRM — Tave-style lifecycle enhancements
-- Apply via: source ~/.env && CLOUDFLARE_API_KEY=$CLOUDFLARE_API_KEY CLOUDFLARE_EMAIL=$CLOUDFLARE_EMAIL \
--   npx wrangler@latest d1 execute nationalcloset-crm --remote --file=crm/migrations/0004_tave_lifecycle.sql

-- ----------------------------------------------------------------
-- Email templates: reusable, with {{merge_fields}}
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_templates (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'general',  -- general | lead | estimate | proposal | contract | appointment | install
  subject         TEXT NOT NULL,
  body_html       TEXT NOT NULL,
  body_text       TEXT,
  description     TEXT,
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_templates_category ON email_templates(category, active);

-- Seed: common templates we use in the lifecycle
INSERT OR IGNORE INTO email_templates (slug, name, category, subject, body_html, body_text, description) VALUES
  ('new-lead-welcome',
   'New lead — welcome touch',
   'lead',
   'Thanks for reaching out, {{contact.first_name}}',
   '<p>Hi {{contact.first_name}},</p><p>Thank you for getting in touch with National Closet Company. We received your inquiry and will reach out within one business day to schedule your free in-home consultation.</p><p>If you''d like to pick a time right now, you can book directly here:<br/><a href="https://nationalclosetco.com/book/">https://nationalclosetco.com/book/</a></p><p>Talk soon,<br/>— National Closet Company</p>',
   NULL,
   'First-touch reply to a new lead.'),

  ('consult-confirmed',
   'Consultation confirmed',
   'appointment',
   'Your consultation is confirmed — {{appointment.pretty_date}}',
   '<p>Hi {{contact.first_name}},</p><p>Your free in-home consultation is booked for <strong>{{appointment.pretty_date}}</strong>.</p><p>We''ll bring samples, measure every window, and leave you with a written quote on the visit — no obligation. The whole visit usually takes 45–75 minutes depending on window count.</p><p>Need to reschedule? <a href="{{appointment.cancel_url}}">Click here</a> or call/text 629-298-8241.</p><p>Looking forward to meeting you,<br/>— National Closet Company</p>',
   NULL,
   'Booking confirmation w/ iCal attachment.'),

  ('estimate-sent',
   'Estimate is ready',
   'estimate',
   'Your estimate — {{estimate.number}} ({{estimate.total}})',
   '<p>Hi {{contact.first_name}},</p><p>Thank you for the visit. Here is your written estimate for <strong>{{project.name}}</strong>:</p><ul><li>Estimate: <strong>{{estimate.number}}</strong></li><li>Total: <strong>{{estimate.total}}</strong></li><li>Valid through: <strong>{{estimate.valid_until}}</strong></li></ul><p>View and approve online: <a href="{{estimate.view_url}}">{{estimate.view_url}}</a></p><p>Questions? Reply to this email or call 629-298-8241.</p>',
   NULL,
   'Send when an estimate is ready.'),

  ('proposal-sent',
   'Proposal is ready',
   'proposal',
   'Your proposal — {{proposal.number}}',
   '<p>Hi {{contact.first_name}},</p><p>Here''s the proposal for <strong>{{project.name}}</strong>. We''ve laid out three options — pick the one that fits, or write back with questions.</p><p>Open the proposal online to compare tiers side-by-side: <a href="{{proposal.view_url}}">{{proposal.view_url}}</a></p>',
   NULL,
   'Send a multi-tier proposal.'),

  ('contract-sent',
   'Contract ready to sign',
   'contract',
   'Your contract — {{contract.number}} (please review &amp; sign)',
   '<p>Hi {{contact.first_name}},</p><p>Here''s the contract for <strong>{{project.name}}</strong>. Please review the scope and terms, then sign at the bottom of the page to book the job.</p><ul><li>Contract: <strong>{{contract.number}}</strong></li><li>Total: <strong>{{contract.total}}</strong></li><li>Deposit to release order: <strong>{{contract.deposit}}</strong></li></ul><p><a href="{{contract.view_url}}">Review &amp; sign here</a></p><p>After you sign, we''ll counter-sign and release the order to our manufacturing partners.</p>',
   NULL,
   'Send the contract for e-signature.'),

  ('booked-thank-you',
   'Job is booked — next steps',
   'contract',
   'You''re booked! Next steps for {{project.name}}',
   '<p>Hi {{contact.first_name}},</p><p>Welcome to the family — your job is officially booked. We''ve counter-signed contract <strong>{{contract.number}}</strong> and your order is being released to our manufacturing partners.</p><p>Here''s what happens next:</p><ol><li>We''ll send a deposit reminder if not already paid</li><li>Manufacturing takes about 2–4 weeks</li><li>We''ll reach out to schedule the install once your treatments arrive</li></ol><p>Questions any time: 629-298-8241</p><p>Thank you,<br/>— National Closet Company</p>',
   NULL,
   'Sent automatically after counter-sign.'),

  ('install-scheduled',
   'Install date confirmed',
   'install',
   'Install scheduled — {{appointment.pretty_date}}',
   '<p>Hi {{contact.first_name}},</p><p>Good news — your install is scheduled for <strong>{{appointment.pretty_date}}</strong>.</p><p>Plan for the team to be at your home for {{appointment.duration_hours}} hours. We''ll arrive with drop cloths, vacuum every speck of drywall dust, and not leave until every window is right.</p><p>If you need to reschedule, call us at 629-298-8241.</p>',
   NULL,
   'Send when install appointment is on the books.');

-- ----------------------------------------------------------------
-- Contact portal token: clients log in via /portal/?t=<token>
-- ----------------------------------------------------------------
ALTER TABLE contacts ADD COLUMN portal_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_portal ON contacts(portal_token);

-- ----------------------------------------------------------------
-- Communications: emails sent through the system (so we can show
-- per-job and per-contact comms threads, Tave-style)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS communications (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id      INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  project_id      INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  estimate_id     INTEGER REFERENCES estimates(id) ON DELETE SET NULL,
  proposal_id     INTEGER REFERENCES proposals(id) ON DELETE SET NULL,
  contract_id     INTEGER REFERENCES contracts(id) ON DELETE SET NULL,
  direction       TEXT NOT NULL DEFAULT 'out',     -- out (we sent) | in (they replied — manual log for now)
  channel         TEXT NOT NULL DEFAULT 'email',   -- email | sms | phone | note
  template_slug   TEXT,                            -- if sent from a template
  subject         TEXT,
  body_html       TEXT,
  body_text       TEXT,
  to_addr         TEXT,
  from_addr       TEXT,
  status          TEXT NOT NULL DEFAULT 'sent',    -- sent | delivered | bounced | failed
  author_user_id  INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comms_contact ON communications(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comms_project ON communications(project_id, created_at DESC);
