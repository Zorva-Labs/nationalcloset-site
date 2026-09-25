# Mail, the cron and the morning sweeps

## Mail
- Every send goes over the Gmail API through the Google Workspace service account (`GOOGLE_SA_EMAIL`, `GOOGLE_SA_PRIVATE_KEY`; domain-wide delegation for gmail.send and gmail.readonly), acting as `GOOGLE_WORKSPACE_USER` (hello@ by default). The account's name and client id are in `site.json → mail`.
- Customer mail is from `MAIL_FROM` (National Closet Company <hello@nationalclosetco.com>). Staff alerts go to `STAFF_EMAIL` (hello@), sent as `ALERT_FROM_USER` (crm@, `alertSender`), so they are never self-addressed.
- `_lib/email.js` checks recipient domains over DoH and never sends spoof-shaped self-mail (a foreign Reply-To on a self-addressed message is dropped).
- A new lead gets the welcome mail from `_lib/lead-ack.js` once it has an email address (`docs/tracking.md`).
- Inbound: `/api/internal/email-sync` (`_lib/email-sync.js`) reads the Inbox and the Sent folder into `email_messages`, matched to contacts, leads and projects; mail the CRM composed carries `X-NCC-Origin: crm` and is skipped. Its cursor is the `email_sync_state` row: it needs its INBOX seed row (mailbox `INBOX`, `uid_validity` 2 marks a Gmail cursor).

## The cron
- Scheduling: Worker `nationalcloset-email-cron` (`~/nationalcloset-cron`, `*/3 * * * *`) POSTs `/api/internal/email-sync`, `/advance-jobs`, `/proposal-expiry` with `Authorization: Bearer $NCC_CRON_SECRET` (the Pages secret `CRON_SECRET`). Each endpoint also takes a CRM session, for a manual run.
- `/advance-jobs`, on every tick: a job whose install date has come moves from `scheduled_install` to `installing`, the client gets the stage email, and the balance invoice goes out (`docs/crm.md`). Then the customer's consult reminders, the consult briefs and the review requests, each also runnable alone (`/api/internal/appointment-reminders`, `/api/internal/review-requests`).
- `/proposal-expiry`: the "expires tomorrow" reminder, and a lapsed proposal flips to expired.
- Central time: the consult brief reads the clock through the IANA zone (`centralNow()`); the reminders, the review requests, the install-day flip and the traffic page's "today" use a flat UTC-5 (Central daylight time), an hour off while Central is on standard time.

## The customer's reminder
- `_lib/appointment-reminders.js`: on the morning of a consultation or measure, after 7am Central, the client is emailed a reminder; `reminder_sent_at` is stamped first, so it goes once.

## The consult brief
- **Consult brief** (`_lib/consult-brief.js`): the morning of a consult or measure, every assigned team member is emailed the client's name, phone, email, the time, the address linked to Google Maps, rooms, notes, who else is going and a `/crm/calendar.html?appt=<id>` deep link. Sent as crm@ (`alertSender`), one email per assignee, **never to the client**, and deliberately not written to `email_messages` — that table is the client conversation; the record is an `activity_log` entry on the appointment. Nobody assigned → the whole active roster, and the email says so.
- Wording is the `consult_brief` row in `email_templates` with a byte-identical `FALLBACK` in the module (keep the two in step; migrations 0070 + 0071 are the source). Never write "Today" into it — the manual send can go out days early; use `{{day_word}}` / `{{day_relative}}` / `{{greeting}}`. A token the sender doesn't supply is blanked, never mailed as a literal.
- Guarded by `appointments.team_brief_sent_at`, stamped before sending, after 7am Central (`centralNow()` uses the IANA zone, not a flat -5). Manual early send: `POST /api/appointments/[id] {action:"send_team_brief"}` ("Send crew brief" on the appointment), which does not stamp, so the morning brief still goes.

## Review requests
- `_lib/review-requests.js`: completed projects 12 h+, design visits 2+ days (within 30, and not for a lead marked lost or a client with a signed job), 9am–8pm CT, once per contact per 90 days, ten per tick, email only — **no SMS, owner declined Twilio**. The wording is the `review_request` and `review_request_visit` rows in `email_templates`; the link in them is `/review` (`docs/content.md`).
