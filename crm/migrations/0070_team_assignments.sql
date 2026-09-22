-- 2026-09-22 — team members, assignment, and the morning-of consult brief.
--
-- Until now every appointment and every job belonged to "the company" and the
-- owners worked out between themselves who was going. This adds a real roster,
-- lets a consult or a job be assigned to one or both of them, and emails the
-- assigned people their brief on the morning of the visit.
--
-- Apply: set -a; . ~/.env; set +a; unset CLOUDFLARE_API_TOKEN
--   npx wrangler d1 execute nationalcloset-crm --remote --file=crm/migrations/0070_team_assignments.sql

-- The roster. Seeded with the two owners; a third installer can be added from
-- the CRM (Team page) without a migration.
CREATE TABLE IF NOT EXISTS team_members (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  phone       TEXT,
  role        TEXT,                              -- owner | designer | installer
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO team_members (name, email, role) VALUES
  ('Michael Blair', 'michael@blaircustominteriors.com', 'owner'),
  ('Noah Blair',    'noah@blaircustominteriors.com',    'owner');

-- Who is on a consult / a job. A join table rather than a column because both
-- owners go out on the same visit often enough that one-assignee-per-row would
-- be wrong on day one. entity_type is 'appointment' or 'project'.
CREATE TABLE IF NOT EXISTS assignments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type    TEXT NOT NULL,
  entity_id      INTEGER NOT NULL,
  team_member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  assigned_at    TEXT NOT NULL DEFAULT (datetime('now')),
  assigned_by    TEXT,
  UNIQUE (entity_type, entity_id, team_member_id)
);
CREATE INDEX IF NOT EXISTS idx_assign_entity ON assignments(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_assign_member ON assignments(team_member_id);

-- Guard so the morning-of team brief is sent once per appointment. Separate
-- from reminder_sent_at, which is the CUSTOMER's reminder — the two sweeps have
-- to be independently idempotent.
ALTER TABLE appointments ADD COLUMN team_brief_sent_at TEXT;

-- The brief itself. Editable wording in the CRM (Templates → Email), same as
-- every other automated email; _lib/consult-brief.js carries a byte-identical
-- fallback so a deleted or deactivated row can't silence the morning email.
--
-- Every token below is always given a value by the sender (an em dash when a
-- field is empty), because renderTemplate leaves an unresolved token literal —
-- "{{notes}}" in a crew member's inbox at 7am is worse than "—".
INSERT INTO email_templates (name, kind, subject, body_text, body_html, variables_used, is_default, is_active, created_at, updated_at)
SELECT
  'Consult brief — morning of the visit',
  'consult_brief',
  'Today {{appointment_time}}: {{client_name}} — {{city_or_address}}',
  'Morning {{team_first_name}},

Today''s {{visit_type}} is at {{appointment_time}}.

CLIENT     {{client_name}}
PHONE      {{client_phone}}
EMAIL      {{client_email}}
WHEN       {{appointment_date}} at {{appointment_time}} ({{duration}})
ADDRESS    {{address}}
DIRECTIONS {{maps_link}}
ROOMS      {{rooms}}
NOTES      {{notes}}
GOING      {{team_list}}

Open the consult in the CRM: {{crm_link}}

Call or text the client if you are running late — {{client_phone}}.',
  '<p style="margin:0 0 14px">Morning {{team_first_name}},</p>
<p style="margin:0 0 4px">Today''s <strong>{{visit_type}}</strong> is at <strong>{{appointment_time}}</strong>. Everything you need is below.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:20px 0 6px;font-size:15px">
  <tr><td style="padding:10px 0;border-bottom:1px solid #E3E1DC;color:#6C665B;width:104px;vertical-align:top">Client</td><td style="padding:10px 0;border-bottom:1px solid #E3E1DC;color:#16140F;font-weight:700">{{client_name}}</td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid #E3E1DC;color:#6C665B;vertical-align:top">Phone</td><td style="padding:10px 0;border-bottom:1px solid #E3E1DC"><a href="tel:{{client_phone_href}}" style="color:#D2683F;text-decoration:none;font-weight:700">{{client_phone}}</a></td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid #E3E1DC;color:#6C665B;vertical-align:top">Email</td><td style="padding:10px 0;border-bottom:1px solid #E3E1DC"><a href="mailto:{{client_email}}" style="color:#D2683F;text-decoration:none">{{client_email}}</a></td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid #E3E1DC;color:#6C665B;vertical-align:top">When</td><td style="padding:10px 0;border-bottom:1px solid #E3E1DC;color:#16140F">{{appointment_date}} at <strong>{{appointment_time}}</strong> &middot; {{duration}}</td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid #E3E1DC;color:#6C665B;vertical-align:top">Address</td><td style="padding:10px 0;border-bottom:1px solid #E3E1DC"><a href="{{maps_link}}" style="color:#D2683F;text-decoration:none;font-weight:700">{{address}}</a></td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid #E3E1DC;color:#6C665B;vertical-align:top">Rooms</td><td style="padding:10px 0;border-bottom:1px solid #E3E1DC;color:#16140F">{{rooms}}</td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid #E3E1DC;color:#6C665B;vertical-align:top">Notes</td><td style="padding:10px 0;border-bottom:1px solid #E3E1DC;color:#16140F">{{notes}}</td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid #E3E1DC;color:#6C665B;vertical-align:top">Going</td><td style="padding:10px 0;border-bottom:1px solid #E3E1DC;color:#16140F">{{team_list}}</td></tr>
</table>
<p style="margin:22px 0 6px"><a href="{{maps_link}}" style="display:inline-block;background:#D2683F;color:#ffffff;text-decoration:none;padding:14px 26px;font-size:14px;font-weight:700;border-radius:6px;font-family:''Montserrat'',''Helvetica Neue'',Arial,sans-serif">Open in Google Maps</a></p>
<p style="margin:14px 0 0;font-size:13px;color:#6C665B">Running late? Call or text {{client_name}} at <a href="tel:{{client_phone_href}}" style="color:#D2683F;text-decoration:none">{{client_phone}}</a>. &nbsp;<a href="{{crm_link}}" style="color:#D2683F;text-decoration:none">Open in the CRM &rarr;</a></p>',
  'team_first_name,visit_type,client_name,client_phone,client_phone_href,client_email,appointment_date,appointment_time,duration,address,city_or_address,maps_link,rooms,notes,team_list,crm_link',
  1, 1, datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE kind = 'consult_brief');
