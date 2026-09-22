-- The consult brief said "Today" whatever day the visit was on. The morning
-- sweep only sends on the day, but "Send crew brief" in the calendar can send
-- days early — a Tuesday send for Brad Lay's Friday consult arrived saying
-- "Today 11:00 AM". The sender now supplies {{day_word}} (Today / Tomorrow /
-- Friday / Friday, October 2), {{day_relative}} (today / tomorrow / on Friday)
-- and {{greeting}} (Morning / Afternoon / Evening, by the Central clock).
-- REPLACE() touches only the seeded phrases, so any other edit the owner made
-- to the row survives. Keep FALLBACK in functions/_lib/consult-brief.js in step.
UPDATE email_templates SET
  subject   = REPLACE(subject, 'Today {{appointment_time}}', '{{day_word}} {{appointment_time}}'),
  body_text = REPLACE(REPLACE(body_text,
                'Morning {{team_first_name}},', '{{greeting}} {{team_first_name}},'),
                'Today''s {{visit_type}} is at {{appointment_time}}.', 'Your {{visit_type}} is {{day_relative}} at {{appointment_time}}.'),
  body_html = REPLACE(REPLACE(body_html,
                '>Morning {{team_first_name}},', '>{{greeting}} {{team_first_name}},'),
                'Today''s <strong>{{visit_type}}</strong> is at', 'Your <strong>{{visit_type}}</strong> is {{day_relative}} at'),
  updated_at = datetime('now')
WHERE kind = 'consult_brief';
