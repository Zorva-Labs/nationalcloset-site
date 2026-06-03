CREATE TABLE IF NOT EXISTS email_messages (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  direction           TEXT NOT NULL CHECK (direction IN ('out', 'in')),
  status              TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','received')),
  contact_id          INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  lead_id             INTEGER REFERENCES leads(id)    ON DELETE SET NULL,
  project_id          INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  message_id_header   TEXT,
  in_reply_to         TEXT,
  references_header   TEXT,
  thread_key          TEXT,
  from_name           TEXT,
  from_addr           TEXT NOT NULL,
  to_addrs            TEXT NOT NULL,
  cc_addrs            TEXT,
  bcc_addrs           TEXT,
  reply_to            TEXT,
  subject             TEXT,
  body_text           TEXT,
  body_html           TEXT,
  template_id         INTEGER,
  template_kind       TEXT,
  attachments_meta    TEXT,
  raw_headers         TEXT,
  sent_at             TEXT,
  received_at         TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  author_user_id      INTEGER,
  error_code          TEXT,
  error_message       TEXT
);

CREATE TABLE IF NOT EXISTS email_templates (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  kind            TEXT NOT NULL,
  subject         TEXT NOT NULL,
  body_text       TEXT,
  body_html       TEXT,
  variables_used  TEXT,
  bind_lead_status     TEXT,
  bind_project_status  TEXT,
  is_default      INTEGER NOT NULL DEFAULT 0,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  author_user_id  INTEGER
);

CREATE TABLE IF NOT EXISTS email_sync_state (
  mailbox         TEXT PRIMARY KEY,
  uid_validity    INTEGER,
  uid_next        INTEGER,
  last_run_at     TEXT,
  last_result     TEXT,
  fetched_count   INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_email_msg_contact  ON email_messages(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_msg_lead     ON email_messages(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_msg_project  ON email_messages(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_msg_thread   ON email_messages(thread_key);
CREATE INDEX IF NOT EXISTS idx_email_msg_mid      ON email_messages(message_id_header);
CREATE INDEX IF NOT EXISTS idx_email_msg_inreply  ON email_messages(in_reply_to);
CREATE INDEX IF NOT EXISTS idx_email_msg_inbox    ON email_messages(direction, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_tpl_kind   ON email_templates(kind);
CREATE INDEX IF NOT EXISTS idx_email_tpl_active ON email_templates(is_active);

INSERT OR IGNORE INTO email_sync_state (mailbox, uid_next) VALUES ('INBOX', 0);
INSERT OR IGNORE INTO email_templates (name, kind, subject, body_text, variables_used, is_default) VALUES
  ('New lead — initial reach-out', 'lead_new',
   'Thanks for reaching out to National Closet Company, {{first_name}}',
   'Hi {{first_name}},

Thanks for the inquiry on {{interest}} — got it in front of me and I would love to set up a quick in-home consultation so I can take measurements, show samples, and put together exactly the right options for your home.

What does the rest of this week look like for you? I can usually get out within a day or two. If a phone call is easier first, my number is 629-298-8241.

Looking forward to it,
Michael Blair
National Closet Company — Gallatin, TN',
   '["first_name","interest"]', 1),
  ('Consultation confirmation', 'consult_confirm',
   'Confirmed: your in-home consultation, {{appointment_date}}',
   'Hi {{first_name}},

Just confirming your free consultation for {{appointment_date}} at {{appointment_time}}.

Address on file:
{{address}}

I will bring the full sample kit (faux wood, real wood, cellular, roller, solar, woven, plantation shutter sections) so we can compare side by side in your actual light. Typically takes 30-45 minutes per main living area.

If you need to reschedule, just text 629-298-8241 — no problem at all.

See you then,
Michael Blair',
   '["first_name","appointment_date","appointment_time","address"]', 1),
  ('Proposal sent — follow up', 'proposal_followup',
   'A few options for your {{interest}} — proposal inside',
   'Hi {{first_name}},

Quick follow-up to the consultation — I have put together three options at three price points so you can see exactly how the numbers move with material choice.

You can view the proposal here:
{{proposal_link}}

The link is yours to come back to anytime. Once you are ready, accepting on the proposal moves it straight to a contract — no second round of paperwork.

Any questions, just reply here or call/text 629-298-8241.

Michael Blair',
   '["first_name","interest","proposal_link"]', 1),
  ('Contract follow-up', 'contract_followup',
   'Final step: signature on the contract',
   'Hi {{first_name}},

Thanks for accepting the proposal — the contract is ready for your signature here:
{{contract_link}}

Once it is signed I will get the order placed and reach out to schedule install. Lead times for most products are 2-6 weeks; I will give you a tighter window the moment the order goes in.

Reply with any questions or hit me at 629-298-8241.

Michael Blair',
   '["first_name","contract_link"]', 1),
  ('Install scheduled', 'install_scheduled',
   'Install scheduled — {{appointment_date}}',
   'Hi {{first_name}},

Great news — your install is on the calendar for {{appointment_date}} at {{appointment_time}}.

I will be at:
{{address}}

I usually need a couple of hours per main area (more for plantation shutters or motorized setups). Pets are no problem — just give me a heads-up.

Day-of, if anything shifts, I will text. Otherwise see you then.

Michael Blair',
   '["first_name","appointment_date","appointment_time","address"]', 1),
  ('Post-install thank-you', 'post_install_thanks',
   'All done — thank you for trusting National Closet Company',
   'Hi {{first_name}},

It was a pleasure working on your home. Every product is covered under manufacturer warranty plus 90 days of workmanship on the install itself — anything goes sideways, text or call and I will be back out.

If you are happy with the work, a quick Google review would mean a lot. It is how a local shop like this stays going:
https://g.page/r/CIpL2ZyDdrPjEAE/review

And of course if anyone you know is shopping for window treatments, send them my way.

Thank you,
Michael Blair — National Closet Company',
   '["first_name"]', 1),
  ('Generic touch-base', 'touch_base',
   'Quick check-in',
   'Hi {{first_name}},

Just circling back on your {{interest}} project — let me know if anything has changed on your end or if there is anything I can clarify on the options we discussed.

Happy to send updated samples by mail if it helps.

Michael Blair
629-298-8241',
   '["first_name","interest"]', 0);
